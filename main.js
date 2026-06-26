const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let aiProcess = null;
let isExamActive = false;
let deviceBaseline = new Set();
let devicePoller = null;
let deviceBaselineReady = false;

const SUSPICIOUS_DEVICE_CLASSES = new Set([
  'WPD',
  'DiskDrive',
  'CDROM',
]);

const IGNORED_DEVICE_NAME_PATTERNS = [
  /camera/i,
  /bluetooth/i,
  /composite device/i,
  /host controller/i,
  /root hub/i,
  /webcam/i,
  /wide vision/i,
];

function startServices() {
  console.log('Starting backend service...');
  // Spawn backend: node server/src/index.js
  backendProcess = spawn('node', [path.join(__dirname, 'server/src/index.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: '5000' },
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend] ${data}`);
  });
  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend Err] ${data}`);
  });
  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });

  console.log('Starting AI service...');
  const venvPython = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python';
  // Spawn AI service: python -m uvicorn app:app --host 127.0.0.1 --port 8000
  aiProcess = spawn(pythonBin, ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: path.join(__dirname, 'ai-service'),
    env: process.env,
  });

  aiProcess.stdout.on('data', (data) => {
    console.log(`[AI] ${data}`);
  });
  aiProcess.stderr.on('data', (data) => {
    console.error(`[AI Err] ${data}`);
  });
  aiProcess.on('close', (code) => {
    console.log(`AI process exited with code ${code}`);
  });
}

function killServices() {
  console.log('Cleaning up subprocesses...');
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (aiProcess) {
    aiProcess.kill();
    aiProcess = null;
  }
}

function normalizeDevice(device) {
  return {
    id: String(device.InstanceId || device.DeviceID || device.PNPDeviceID || device.Name || '').trim(),
    name: String(device.FriendlyName || device.Name || 'External device').trim(),
    deviceClass: String(device.Class || device.PNPClass || '').trim(),
    status: String(device.Status || '').trim(),
  };
}

function isReportableExternalDevice(device) {
  if (!SUSPICIOUS_DEVICE_CLASSES.has(device.deviceClass)) {
    return false;
  }
  return !IGNORED_DEVICE_NAME_PATTERNS.some((pattern) => pattern.test(device.name));
}

function getConnectedDevices() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve([]);
      return;
    }

    const script = [
      'Get-PnpDevice -PresentOnly',
      "Where-Object { $_.Status -eq 'OK' }",
      'Select-Object InstanceId,FriendlyName,Class,Status',
      'ConvertTo-Json -Compress',
    ].join(' | ');

    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: 5000,
    }, (_err, stdout) => {
      try {
        if (!stdout.trim()) {
          resolve([]);
          return;
        }
        const parsed = JSON.parse(stdout);
        const devices = (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeDevice);
        resolve(devices.filter((device) => device.id));
      } catch {
        resolve([]);
      }
    });
  });
}

async function startExternalDeviceMonitor() {
  const devices = await getConnectedDevices();
  deviceBaseline = new Set(devices.map((device) => device.id));
  deviceBaselineReady = deviceBaseline.size > 0;

  clearInterval(devicePoller);
  devicePoller = setInterval(async () => {
    if (!isExamActive || !mainWindow) return;
    const current = await getConnectedDevices();
    if (!deviceBaselineReady) {
      deviceBaseline = new Set(current.map((device) => device.id));
      deviceBaselineReady = true;
      return;
    }
    for (const device of current) {
      if (deviceBaseline.has(device.id)) continue;
      deviceBaseline.add(device.id);
      if (!isReportableExternalDevice(device)) continue;

      mainWindow.webContents.send('external-device-connected', {
        name: device.name,
        deviceClass: device.deviceClass,
        id: device.id,
      });
    }
  }, 5000);
}

function stopExternalDeviceMonitor() {
  clearInterval(devicePoller);
  devicePoller = null;
  deviceBaseline = new Set();
  deviceBaselineReady = false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load backend url which serves React client (retrying if server is not fully started yet)
  const loadURLWithRetry = () => {
    if (!mainWindow) return;
    mainWindow.loadURL('http://localhost:5000').catch(() => {
      console.log('Connection to localhost:5000 refused, retrying in 1.5s...');
      setTimeout(loadURLWithRetry, 1500);
    });
  };
  loadURLWithRetry();

  mainWindow.on('close', (e) => {
    if (isExamActive) {
      e.preventDefault();
      dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        title: 'Exam Lock Active',
        message: 'You cannot close the application or leave the screen during an active exam. Please finish and submit the exam first.',
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function configureDisplayMedia() {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const primaryScreen = sources.find((source) => /screen 1|entire screen/i.test(source.name)) || sources[0];
        if (!primaryScreen) {
          callback({});
          return;
        }
        callback({ video: primaryScreen });
      })
      .catch((err) => {
        console.error('Display media request failed:', err);
        callback({});
      });
  });
}

app.on('ready', () => {
  configureDisplayMedia();
  startServices();
  // Wait a short duration to let the servers start before showing the UI
  setTimeout(createWindow, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  killServices();
});

// IPC handlers for Exam Mode
ipcMain.on('enter-exam-mode', () => {
  console.log('Entering exam mode...');
  isExamActive = true;
  if (mainWindow) {
    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setFullScreen(true);
    
    // Lock focus: if window loses focus, force it back
    mainWindow.on('blur', forceFocus);
  }
  startExternalDeviceMonitor();
});

ipcMain.on('exit-exam-mode', () => {
  console.log('Exiting exam mode...');
  isExamActive = false;
  if (mainWindow) {
    mainWindow.setKiosk(false);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setFullScreen(false);
    mainWindow.off('blur', forceFocus);
  }
  stopExternalDeviceMonitor();
});

ipcMain.handle('print-page', async () => {
  if (!mainWindow) {
    return { ok: false, message: 'Print window is not available.' };
  }

  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        printBackground: true,
        silent: false,
      },
      (success, failureReason) => {
        if (success) {
          resolve({ ok: true });
          return;
        }
        resolve({ ok: false, message: failureReason || 'Printing was cancelled or failed.' });
      }
    );
  });
});

function forceFocus() {
  if (isExamActive && mainWindow) {
    mainWindow.focus();
  }
}
