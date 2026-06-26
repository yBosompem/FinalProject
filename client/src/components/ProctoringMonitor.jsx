import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { api } from '../api/client';

const ALERT_LABELS = {
  no_face: 'No face detected',
  multiple_faces: 'Multiple faces detected',
  looking_away: 'Looking away from screen',
  unusual_movement: 'Unusual movement',
  phone_detected: 'Mobile phone / device detected',
  voice_detected: 'Voice detected',
  whispering_detected: 'Whispering / low voice detected',
  suspicious_head_movement: 'Suspicious head movement',
  tab_hidden: 'Left the exam screen',
  window_blur: 'Exam window lost focus',
};

function StatusDot({ status }) {
  const cls =
    status === 'active'
      ? 'proctor-status-dot--active'
      : status === 'requesting' || status === 'pending'
        ? 'proctor-status-dot--pending'
        : status === 'stopped'
          ? 'proctor-status-dot--stopped'
          : 'proctor-status-dot--off';
  return <span className={`proctor-status-dot ${cls}`} />;
}

function RiskRing({ score }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const high = score >= 55;
  const stroke = high ? 'var(--danger)' : score >= 30 ? 'var(--warning)' : 'var(--success)';

  return (
    <div className="proctor-risk-ring" title={`Risk score: ${score}/100`}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
      </svg>
      <span className={`proctor-risk-value${high ? ' proctor-risk-value--high' : ''}`}>{score}</span>
    </div>
  );
}

async function requestEntireScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is not available. In the desktop app, restart after the Electron update is applied.');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: 'always' },
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  const surface = track.getSettings()?.displaySurface;
  if (surface && surface !== 'monitor') {
    track.stop();
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(
      'Please share your entire screen (select "Entire screen" in the browser dialog, not a window or tab).'
    );
  }
  return stream;
}

const ProctoringMonitor = forwardRef(function ProctoringMonitor(
  {
    sessionId,
    active,
    setupMode = 'all',
    onRiskUpdate,
    onScreenShareLost,
    onFocusViolation,
    onReadyChange,
    onStatusChange,
  },
  ref
) {
  const webcamRef = useRef(null);
  const screenRef = useRef(null);
  const canvasRef = useRef(null);
  const screenCanvasRef = useRef(null);
  const recordCanvasRef = useRef(null);
  const recordAnimRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const voiceStreakRef = useRef(0);

  const webcamStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const [webcamStatus, setWebcamStatus] = useState('pending');
  const [screenStatus, setScreenStatus] = useState('pending');
  const [recordingStatus, setRecordingStatus] = useState('off');
  const [lastAlert, setLastAlert] = useState(null);
  const [riskScore, setRiskScore] = useState(0);
  const screenLostReported = useRef(false);

  const stopRecordingInternal = useCallback(() => {
    if (recordAnimRef.current) {
      cancelAnimationFrame(recordAnimRef.current);
      recordAnimRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  const stopAll = useCallback(() => {
    stopRecordingInternal();
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    webcamStreamRef.current = null;
    screenStreamRef.current = null;
    screenTrackRef.current = null;
    setWebcamStatus('pending');
    setScreenStatus('pending');
    setRecordingStatus('off');
  }, [stopRecordingInternal]);

  const uploadRecording = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve();
        return;
      }

      recorder.onstop = async () => {
        try {
          const blob = new Blob(recordChunksRef.current, { type: 'video/webm' });
          recordChunksRef.current = [];
          if (blob.size > 1000 && sessionId) {
            setRecordingStatus('uploading');
            await api.uploadRecording(sessionId, blob);
            setRecordingStatus('saved');
          }
        } catch (err) {
          console.warn('Recording upload failed:', err.message);
          setRecordingStatus('failed');
        }
        resolve();
      };

      if (recorder.state === 'recording') recorder.stop();
      else resolve();
    });
  }, [sessionId]);

  useImperativeHandle(ref, () => ({ stopAll, uploadRecording }), [stopAll, uploadRecording]);

  const reportEvent = useCallback(
    async (type, message, severity = 'high', metadata = {}) => {
      if (!sessionId) return;
      try {
        await api.postMonitoringEvent(sessionId, { type, message, severity, metadata });
      } catch (err) {
        console.warn('Failed to log event:', err.message);
      }
    },
    [sessionId]
  );

  const showAlerts = useCallback((alerts) => {
    if (!alerts?.length) return;
    const latest = alerts[alerts.length - 1];
    setLastAlert({
      type: latest.type,
      message: latest.message || ALERT_LABELS[latest.type] || latest.type,
    });
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    const video = webcamRef.current;
    const screen = screenRef.current;
    const canvas = canvasRef.current;
    const screenCanvas = screenCanvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !active || !sessionId) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', 0.7);

    let screenImage;
    if (screen && screenCanvas && screen.readyState >= 2) {
      const sctx = screenCanvas.getContext('2d');
      screenCanvas.width = screen.videoWidth || 1280;
      screenCanvas.height = screen.videoHeight || 720;
      sctx.drawImage(screen, 0, 0, screenCanvas.width, screenCanvas.height);
      screenImage = screenCanvas.toDataURL('image/jpeg', 0.55);
    }

    try {
      const result = await api.analyzeFrame(sessionId, image, screenImage);
      setRiskScore(result.riskScore ?? 0);
      onRiskUpdate?.(result);
      showAlerts(result.alerts);
    } catch (err) {
      console.warn('Monitoring frame failed:', err.message);
    }
  }, [sessionId, onRiskUpdate, active, showAlerts]);

  const startVoiceMonitor = useCallback(
    (stream) => {
      try {
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const check = () => {
          if (!active || !sessionId) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) sum += data[i];
          const avg = sum / data.length / 255;

          if (avg > 0.12) {
            voiceStreakRef.current += 1;
            if (voiceStreakRef.current >= 4) {
              const whisper = avg < 0.22;
              reportEvent(
                whisper ? 'whispering_detected' : 'voice_detected',
                whisper
                  ? 'Low voice / whispering detected during exam'
                  : 'Voice or speech detected during exam',
                whisper ? 'high' : 'medium',
                { level: Math.round(avg * 100) }
              );
              voiceStreakRef.current = 0;
            }
          } else {
            voiceStreakRef.current = 0;
          }
          setTimeout(check, 1500);
        };
        check();
      } catch {
        /* mic analysis optional */
      }
    },
    [active, sessionId, reportEvent]
  );

  const startCompositeRecording = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    recordCanvasRef.current = canvas;
    const rctx = canvas.getContext('2d');

    const draw = () => {
      const screen = screenRef.current;
      const cam = webcamRef.current;
      rctx.fillStyle = '#000';
      rctx.fillRect(0, 0, canvas.width, canvas.height);
      if (screen?.readyState >= 2) {
        rctx.drawImage(screen, 0, 0, canvas.width, canvas.height);
      }
      if (cam?.readyState >= 2) {
        const pw = 220;
        const ph = 165;
        rctx.drawImage(cam, canvas.width - pw - 16, 16, pw, ph);
        rctx.strokeStyle = '#0a84ff';
        rctx.lineWidth = 3;
        rctx.strokeRect(canvas.width - pw - 16, 16, pw, ph);
      }
      recordAnimRef.current = requestAnimationFrame(draw);
    };
    draw();

    const stream = canvas.captureStream(4);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

    recordChunksRef.current = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 600000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordChunksRef.current.push(e.data);
    };
    recorder.start(8000);
    mediaRecorderRef.current = recorder;
    setRecordingStatus('recording');
  }, []);

  const setupScreenShare = useCallback(async () => {
    setScreenStatus('requesting');
    const stream = await requestEntireScreen();
    screenStreamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    screenTrackRef.current = track;

    if (screenRef.current) {
      screenRef.current.srcObject = stream;
      await screenRef.current.play();
    }

    track.onended = () => {
      setScreenStatus('stopped');
      if (active && !screenLostReported.current) {
        screenLostReported.current = true;
        reportEvent('screen_share_stopped', 'Screen sharing was stopped during the exam');
        onScreenShareLost?.();
      }
    };

    setScreenStatus('active');
  }, [active, reportEvent, onScreenShareLost]);

  const setupWebcam = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Webcam or microphone access is not available in this environment.');
    }
    setWebcamStatus('requesting');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: true,
    });
    webcamStreamRef.current = stream;
    if (webcamRef.current) {
      webcamRef.current.srcObject = stream;
      await webcamRef.current.play();
    }
    setWebcamStatus('active');
    startVoiceMonitor(stream);
  }, [startVoiceMonitor]);

  const startWebcamOnly = useCallback(async () => {
    try {
      await setupWebcam();
      setLastAlert(null);
    } catch (err) {
      setWebcamStatus('stopped');
      throw err;
    }
  }, [setupWebcam]);

  const startScreenOnly = useCallback(async () => {
    try {
      await setupScreenShare();
      setLastAlert(null);
    } catch (err) {
      setScreenStatus('stopped');
      throw err;
    }
  }, [setupScreenShare]);

  const setupProctoring = useCallback(async () => {
    try {
      await setupWebcam();
      await setupScreenShare();
      setLastAlert(null);
    } catch (err) {
      if (webcamStatus !== 'active') setWebcamStatus('stopped');
      if (screenStatus !== 'active') setScreenStatus('stopped');
      throw err;
    }
  }, [setupWebcam, setupScreenShare, screenStatus, webcamStatus]);

  useEffect(() => {
    onReadyChange?.(webcamStatus === 'active' && screenStatus === 'active');
    onStatusChange?.({
      webcamReady: webcamStatus === 'active',
      screenReady: screenStatus === 'active',
      proctoringReady: webcamStatus === 'active' && screenStatus === 'active',
    });
  }, [webcamStatus, screenStatus, onReadyChange, onStatusChange]);

  useEffect(() => {
    if (!active || !sessionId || webcamStatus !== 'active') return undefined;

    if (!audioContextRef.current && webcamStreamRef.current) {
      startVoiceMonitor(webcamStreamRef.current);
    }

    if (recordingStatus === 'off' && screenStatus === 'active') {
      startCompositeRecording();
    }

    const intervalId = setInterval(captureAndAnalyze, 2000);
    captureAndAnalyze();
    return () => clearInterval(intervalId);
  }, [
    active,
    sessionId,
    webcamStatus,
    screenStatus,
    captureAndAnalyze,
    recordingStatus,
    startCompositeRecording,
    startVoiceMonitor,
  ]);

  useEffect(() => () => stopAll(), [stopAll]);

  useEffect(() => {
    if (!active || !sessionId) return undefined;

    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      const message = 'Suspicious Activity: You left the exam screen!';
      window.alert(message);
      reportEvent('tab_hidden', message, 'high', { reason: 'visibilitychange' });
      setLastAlert({ type: 'tab_hidden', message });
      onFocusViolation?.(message);
    };

    const handleBlur = () => {
      if (document.hidden) return;
      const message = 'Exam window lost focus.';
      console.log('Exam window lost focus.');
      reportEvent('window_blur', message, 'medium', { reason: 'blur' });
      setLastAlert({ type: 'window_blur', message });
      onFocusViolation?.(message);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [active, sessionId, reportEvent, onFocusViolation]);

  const screenDotStatus =
    screenStatus === 'active' ? 'active' : screenStatus === 'stopped' ? 'stopped' : 'pending';
  const camDotStatus =
    webcamStatus === 'active' ? 'active' : webcamStatus === 'requesting' ? 'pending' : 'off';
  const setupAction =
    setupMode === 'webcam'
      ? startWebcamOnly
      : setupMode === 'screen'
        ? startScreenOnly
        : setupProctoring;
  const setupLabel =
    setupMode === 'webcam'
      ? webcamStatus === 'active'
        ? 'Webcam enabled'
        : 'Enable webcam and microphone'
      : setupMode === 'screen'
        ? screenStatus === 'active'
          ? 'Screen sharing enabled'
          : 'Share entire screen'
        : 'Enable proctoring';
  const setupDescription =
    setupMode === 'webcam'
      ? 'Enable your webcam and microphone. Keep your face clearly visible before continuing.'
      : setupMode === 'screen'
        ? 'Share your entire screen only. Window or tab sharing is not accepted for the exam.'
        : 'Enable entire screen, webcam, and microphone. Your session is recorded for instructor review.';
  const showScreenFeed = setupMode !== 'webcam' || active;
  const showWebcamFeed = setupMode !== 'screen' || active;

  return (
    <div className="proctor-panel glass-card">
      <div className="proctor-header">
        <div>
          <p className="proctor-title">Live Proctoring</p>
          {active && recordingStatus === 'recording' && (
            <span className="badge badge-live" style={{ marginTop: '0.35rem' }}>
              REC
            </span>
          )}
        </div>
        <RiskRing score={riskScore} />
      </div>

      {!active && (
        <div className="proctor-setup">
          <p>{setupDescription}</p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => setupAction().catch((e) => setLastAlert({ message: e.message }))}
            disabled={
              (setupMode === 'webcam' && webcamStatus === 'active') ||
              (setupMode === 'screen' && screenStatus === 'active')
            }
          >
            {setupLabel}
          </button>
        </div>
      )}

      <div className="proctor-status-grid">
        <div className="proctor-status-item">
          <StatusDot status={screenDotStatus} />
          Screen
        </div>
        <div className="proctor-status-item">
          <StatusDot status={camDotStatus} />
          Webcam
        </div>
        <div className="proctor-status-item">
          <StatusDot status={active && recordingStatus === 'recording' ? 'active' : 'off'} />
          AI Monitor
        </div>
        <div className="proctor-status-item">
          <StatusDot status={active ? 'active' : 'off'} />
          Security
        </div>
      </div>

      <div style={!showScreenFeed ? { display: 'none' } : undefined}>
          <p className="proctor-feed-label">
            Screen capture
            {screenStatus === 'active' && <span className="badge badge-success">Live</span>}
          </p>
          <div className="proctor-video-wrap proctor-video-wrap--screen">
            <video ref={screenRef} muted playsInline />
            {active && screenStatus === 'active' && (
              <span className="proctor-feed-badge badge badge-live">LIVE</span>
            )}
            <canvas ref={screenCanvasRef} style={{ display: 'none' }} />
          </div>
      </div>

      <div style={!showWebcamFeed ? { display: 'none' } : undefined}>
          <p className="proctor-feed-label">
            Identity feed
            {webcamStatus === 'active' && <span className="badge badge-success">Live</span>}
          </p>
          <div className="proctor-video-wrap proctor-video-wrap--cam">
            <video ref={webcamRef} muted playsInline />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
      </div>

      {active && (
        <div className="proctor-recording-row">
          <span>Session recording</span>
          <span>{recordingStatus}</span>
        </div>
      )}

      {lastAlert && <div className="proctor-alert">{lastAlert.message}</div>}
    </div>
  );
});

export default ProctoringMonitor;
