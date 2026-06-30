import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import Layout, { NavItem } from '../../components/Layout';

const TYPE_LABELS = {
  no_face: 'Face not visible for several frames',
  multiple_faces: 'Multiple faces visible',
  looking_away: 'Sustained looking away',
  eye_gaze_away: 'Sustained eye gaze away',
  mouth_open: 'Sustained mouth opening',
  unusual_movement: 'Unusual movement observed',
  suspicious_head_movement: 'Unusual head movement',
  face_spoofing: 'Possible spoofing signal',
  phone_detected: 'Mobile phone detected',
  suspicious_object_detected: 'Potential restricted object',
  voice_detected: 'Voice / speech observed',
  whispering_detected: 'Low voice / whispering observed',
  speech_match_detected: 'Speech matched exam keywords',
  monitoring_started: 'Monitoring started',
  screen_share_started: 'Screen share started',
  screen_share_stopped: 'Screen share stopped',
  screen_share_not_monitor: 'Screen not entire display',
  tab_hidden: 'Left exam tab / minimized window',
  window_blur: 'Exam window lost focus',
  exam_submitted: 'Exam submitted',
  recording_saved: 'Recording saved',
};

const CHEAT_TYPES = new Set([
  'no_face',
  'multiple_faces',
  'looking_away',
  'eye_gaze_away',
  'mouth_open',
  'unusual_movement',
  'suspicious_head_movement',
  'face_spoofing',
  'phone_detected',
  'suspicious_object_detected',
  'voice_detected',
  'whispering_detected',
  'speech_match_detected',
  'screen_share_stopped',
  'tab_hidden',
  'window_blur',
]);

const ZERO_RISK_TYPES = new Set([
  'face_verified',
  'monitoring_started',
  'screen_share_started',
  'exam_submitted',
  'recording_saved',
]);

export default function SessionReport() {
  const { sessionId } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);

  useEffect(() => {
    api
      .getReport(sessionId)
      .then(setReport)
      .catch((err) => setError(err.message));
  }, [sessionId]);

  useEffect(() => {
    if (!report?.session?.hasRecording) return undefined;
    let url;
    api
      .fetchRecordingBlob(sessionId)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setVideoUrl(url);
      })
      .catch(() => setVideoUrl(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [report, sessionId]);

  if (error) {
    return (
      <Layout nav={<NavItem to="/admin">Dashboard</NavItem>}>
        <div className="container">
          <div className="alert alert-error">{error}</div>
        </div>
      </Layout>
    );
  }

  if (!report) {
    return (
      <div className="container" style={{ paddingTop: '4rem' }}>
        Loading report…
      </div>
    );
  }

  const { session, events, riskScore } = report;
  const examTypeLabel =
    session.exam?.examType === 'end_of_semester' ? 'End of Semester Exam' : 'Midsemester Exam';
  const cheatEvents = events.filter((e) => CHEAT_TYPES.has(e.type));
  const summary = cheatEvents.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <Layout
      nav={
        <>
          <NavItem to="/admin">Dashboard</NavItem>
          <NavItem to="/admin/flagged">Flagged</NavItem>
        </>
      }
    >
      <div className="container">
        <h1 className="page-title">Report: {session.student?.name}</h1>
        <p className="page-sub">
          {session.student?.email} · {session.exam?.title}
        </p>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.35rem' }}>
            <strong>Reference number:</strong> {session.student?.referenceNumber || 'Not provided'}
          </p>
          <strong>Index number:</strong> {session.student?.studentId || 'Not provided'} · <strong>Exam type:</strong>{' '}
          {examTypeLabel}
        </div>

        <div className="grid-2" style={{ marginBottom: '2rem' }}>
          <div className="card">
            <p style={{ color: 'var(--muted)' }}>Grade (scaled)</p>
            <p style={{ fontSize: '2.5rem', fontWeight: 700 }}>
              {session.scaledScore != null
                ? `${session.scaledScore} / ${session.maxGradePoints ?? session.exam?.maxGradePoints ?? 100}`
                : '—'}
            </p>
            {session.correctCount != null && (
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                {session.correctCount}/{session.totalQuestions} questions correct ({session.examScore}%)
              </p>
            )}
          </div>
          <div className="card">
            <p style={{ color: 'var(--muted)' }}>Integrity risk score</p>
            <p
              style={{
                fontSize: '2.5rem',
                fontWeight: 700,
                color: riskScore >= 55 ? 'var(--danger)' : 'var(--success)',
              }}
            >
              {riskScore}/100
            </p>
            {session.isFlagged && <span className="badge badge-danger">Flagged session</span>}
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
              {cheatEvents.length} review item(s) logged
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
              AI observations are evidence for instructor review, not automatic proof of misconduct.
            </p>
          </div>
        </div>

        {Object.keys(summary).length > 0 && (
          <>
            <h2 style={{ marginBottom: '1rem' }}>Review summary</h2>
            <div className="card" style={{ marginBottom: '2rem' }}>
              <p style={{ color: 'var(--muted)', marginBottom: '0.75rem' }}>
                Items below use sustained detections or model confidence thresholds and should be checked against the recording.
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {Object.entries(summary).map(([type, count]) => (
                  <li key={type} className="badge badge-warning" style={{ padding: '0.4rem 0.75rem' }}>
                    {TYPE_LABELS[type] || type}: {count}×
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <h2 style={{ marginBottom: '1rem' }}>Proctoring recording</h2>
        <div className="card" style={{ marginBottom: '2rem' }}>
          {session.hasRecording && videoUrl ? (
            <>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                Screen + webcam replay for the full exam period (submitted recording).
              </p>
              <video
                src={videoUrl}
                controls
                style={{ width: '100%', maxHeight: 480, borderRadius: 8, background: '#000' }}
              />
            </>
          ) : session.hasRecording ? (
            <p style={{ color: 'var(--muted)' }}>Loading recording…</p>
          ) : (
            <p style={{ color: 'var(--muted)' }}>
              No recording available for this session (student may have blocked upload or used an
              unsupported browser).
            </p>
          )}
        </div>

        {session.questionBreakdown?.length > 0 && (
          <>
            <h2 style={{ marginBottom: '1rem' }}>Grading by question number</h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Q#</th>
                    <th>Student answer</th>
                    <th>Correct answer</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {session.questionBreakdown.map((row) => (
                    <tr key={row.questionIndex}>
                      <td>{row.questionNumber}</td>
                      <td>{row.studentAnswer}</td>
                      <td>{row.correctAnswer}</td>
                      <td>
                        <span className={`badge ${row.isCorrect ? 'badge-success' : 'badge-danger'}`}>
                          {row.isCorrect ? 'Correct' : 'Incorrect'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 style={{ marginBottom: '1rem' }}>Detailed activity log</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Activity</th>
                <th>Severity</th>
                <th>Details</th>
                <th>Risk +</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--muted)' }}>
                    No events recorded
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev._id}>
                    <td>{new Date(ev.createdAt).toLocaleString()}</td>
                    <td>{TYPE_LABELS[ev.type] || ev.type}</td>
                    <td>
                      <span className={`badge badge-${ev.severity === 'high' ? 'danger' : 'warning'}`}>
                        {ev.severity}
                      </span>
                    </td>
                    <td>{ev.message}</td>
                    <td>{!ZERO_RISK_TYPES.has(ev.type) && ev.riskDelta > 0 ? `+${ev.riskDelta}` : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
