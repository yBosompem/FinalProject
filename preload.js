const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  enterExamMode: () => ipcRenderer.send('enter-exam-mode'),
  exitExamMode: () => ipcRenderer.send('exit-exam-mode'),
  printPage: () => ipcRenderer.invoke('print-page'),
  onExternalDeviceConnected: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('external-device-connected', listener);
    return () => ipcRenderer.removeListener('external-device-connected', listener);
  },
});
