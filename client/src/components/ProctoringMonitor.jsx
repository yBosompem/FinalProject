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
};

async function requestEntireScreen() {
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
  { sessionId, active, onRiskUpdate, onScreenShareLost, onReadyChange },
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
        rctx.strokeStyle = '#3b82f6';
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

  const setupProctoring = useCallback(async () => {
    await setupWebcam();
    await setupScreenShare();
  }, [setupWebcam, setupScreenShare]);

  useEffect(() => {
    onReadyChange?.(webcamStatus === 'active' && screenStatus === 'active');
  }, [webcamStatus, screenStatus, onReadyChange]);

  useEffect(() => {
    if (!active || !sessionId || webcamStatus !== 'active') return undefined;

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
  ]);

  useEffect(() => () => stopAll(), [stopAll]);

  const isReady = webcamStatus === 'active' && screenStatus === 'active';

  return (
    <div className="card" style={{ position: 'sticky', top: '1rem' }}>
      <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Proctoring</h3>

      {!active && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Enable <strong>entire screen</strong>, <strong>webcam</strong>, and <strong>microphone</strong>.
            Your session is recorded for instructor review.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => setupProctoring().catch((e) => setLastAlert({ message: e.message }))}
          >
            Enable proctoring
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>
            Entire screen
          </p>
          <div style={{ borderRadius: 8, overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
            <video ref={screenRef} muted playsInline style={{ width: '100%', display: 'block' }} />
          </div>
          <canvas ref={screenCanvasRef} style={{ display: 'none' }} />
        </div>
        <div>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>
            Webcam + mic
          </p>
          <div style={{ borderRadius: 8, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
            <video
              ref={webcamRef}
              muted
              playsInline
              style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
        </div>
      </div>

      <p style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
        Risk:{' '}
        <strong style={{ color: riskScore >= 55 ? 'var(--danger)' : 'var(--text)' }}>
          {riskScore}/100
        </strong>
        {active && (
          <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
            · Recording: {recordingStatus}
          </span>
        )}
      </p>

      {lastAlert && (
        <div className="alert alert-warning" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          {lastAlert.message}
        </div>
      )}
    </div>
  );
});

export default ProctoringMonitor;
