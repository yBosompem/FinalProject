import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const ALERT_LABELS = {
  no_face: 'No face detected',
  multiple_faces: 'Multiple faces detected',
  looking_away: 'Looking away from screen',
  unusual_movement: 'Unusual movement',
};

export default function WebcamMonitor({ sessionId, onRiskUpdate }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('initializing');
  const [lastAlert, setLastAlert] = useState(null);
  const [riskScore, setRiskScore] = useState(0);

  const captureAndAnalyze = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', 0.7);

    try {
      const result = await api.analyzeFrame(sessionId, image);
      setRiskScore(result.riskScore ?? 0);
      onRiskUpdate?.(result);

      const triggered = (result.alerts || []).filter((a) => a.type);
      if (triggered.length > 0) {
        const latest = triggered[triggered.length - 1];
        setLastAlert({
          type: latest.type,
          message: latest.message || ALERT_LABELS[latest.type],
        });
      }
    } catch (err) {
      console.warn('Monitoring frame failed:', err.message);
    }
  }, [sessionId, onRiskUpdate]);

  useEffect(() => {
    let intervalId;
    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('active');
        intervalId = setInterval(captureAndAnalyze, 2500);
        captureAndAnalyze();
      } catch {
        setStatus('denied');
      }
    }

    startCamera();

    return () => {
      mounted = false;
      clearInterval(intervalId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [captureAndAnalyze]);

  return (
    <div className="card" style={{ position: 'sticky', top: '1rem' }}>
      <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>AI Monitoring</h3>
      <div
        style={{
          position: 'relative',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#000',
          aspectRatio: '4/3',
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {status === 'denied' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.85)',
              padding: '1rem',
              textAlign: 'center',
              fontSize: '0.85rem',
            }}
          >
            Webcam access required for this exam
          </div>
        )}
      </div>
      <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
        Status:{' '}
        <span className={status === 'active' ? 'badge badge-success' : 'badge badge-danger'}>
          {status === 'active' ? 'Monitoring active' : status}
        </span>
      </p>
      <p style={{ marginTop: '0.5rem' }}>
        Risk score:{' '}
        <strong style={{ color: riskScore >= 60 ? 'var(--danger)' : 'var(--text)' }}>
          {riskScore}/100
        </strong>
      </p>
      {lastAlert && (
        <div className="alert alert-warning" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          {lastAlert.message}
        </div>
      )}
    </div>
  );
}
