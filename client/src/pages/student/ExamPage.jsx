import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import ProctoringMonitor from '../../components/ProctoringMonitor';
import QuestionNavigator, { isFlagged } from '../../components/QuestionNavigator';

function emptyAnswers(questions) {
  return questions.map((_, i) => ({
    questionIndex: i,
    selectedIndex: null,
    textAnswer: '',
    flagged: false,
  }));
}

function formatTime(ms) {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function ExamPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const proctoringRef = useRef(null);

  const [phase, setPhase] = useState('loading');
  const [exam, setExam] = useState(null);
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [proctoringReady, setProctoringReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submitLockRef = useRef(false);

  const endSession = useCallback(() => {
    proctoringRef.current?.stopAll();
  }, []);

  const submitExam = useCallback(
    async (autoSubmit = false) => {
      if (!session || submitLockRef.current) return;
      submitLockRef.current = true;
      setSubmitting(true);
      try {
        await proctoringRef.current?.uploadRecording?.();
        endSession();
        const result = await api.submitSession(session._id, { answers, autoSubmit });
        navigate('/student', {
          replace: true,
          state: {
            submitted: true,
            message: result.message,
            sessionId: session._id,
            autoSubmit,
          },
        });
      } catch (err) {
        setError(err.message);
        setSubmitting(false);
        submitLockRef.current = false;
      }
    },
    [session, answers, endSession, navigate]
  );

  useEffect(() => {
    async function init() {
      try {
        const status = await api.getExamAttemptStatus(examId);
        if (!status.canStart) {
          setError(status.message || 'You cannot access this exam again.');
          setPhase('blocked');
          return;
        }

        const examData = await api.getExam(examId);
        setExam(examData);

        if (status.canResume && status.session?.status === 'in_progress') {
          setSession(status.session);
          setAnswers(
            status.session.answers?.length
              ? status.session.answers
              : emptyAnswers(examData.questions)
          );
          setRemaining(new Date(status.session.endsAt) - Date.now());
        }

        setPhase('precheck');
      } catch (err) {
        setError(err.message);
        setPhase('blocked');
      }
    }
    init();
  }, [examId]);

  const beginExam = async () => {
    if (!proctoringReady) {
      setError('Enable entire-screen sharing and webcam before starting.');
      return;
    }
    try {
      const sess = session || (await api.startSession(examId));
      setSession(sess);
      setAnswers(
        sess.answers?.length
          ? sess.answers
          : emptyAnswers(exam.questions)
      );
      setRemaining(new Date(sess.endsAt) - Date.now());
      setPhase('exam');
      setError('');

      await api.postMonitoringEvent(sess._id, {
        type: 'screen_share_started',
        message: 'Entire screen sharing active for exam',
        severity: 'low',
      });
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (phase !== 'exam' || !session) return;
    const timer = setInterval(() => {
      const left = new Date(session.endsAt) - Date.now();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
        submitExam(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, session, submitExam]);

  useEffect(() => {
    if (phase !== 'exam' || !session) return;
    const saveTimer = setInterval(() => {
      api.saveAnswers(session._id, answers).catch(() => {});
    }, 15000);
    return () => clearInterval(saveTimer);
  }, [phase, session, answers]);

  const selectAnswer = (qIndex, optionIndex) => {
    setAnswers((prev) =>
      prev.map((a) =>
        a.questionIndex === qIndex ? { ...a, selectedIndex: optionIndex } : a
      )
    );
  };

  const setTextAnswer = (qIndex, text) => {
    setAnswers((prev) =>
      prev.map((a) =>
        a.questionIndex === qIndex ? { ...a, textAnswer: text, selectedIndex: null } : a
      )
    );
  };

  const toggleFlag = (qIndex) => {
    setAnswers((prev) =>
      prev.map((a) =>
        a.questionIndex === qIndex ? { ...a, flagged: !a.flagged } : a
      )
    );
  };

  const handleRiskUpdate = (result) => {
    if (result.alerts?.length) {
      const msgs = result.alerts.map((a) => a.message).filter(Boolean);
      if (msgs.length) {
        setNotifications((prev) => [...msgs.slice(-2), ...prev].slice(0, 5));
      }
    }
  };

  const handleScreenShareLost = () => {
    setNotifications((prev) => [
      'Screen sharing stopped — share your entire screen again or submit the exam.',
      ...prev,
    ]);
    setProctoringReady(false);
  };

  if (phase === 'loading') {
    return (
      <div className="container" style={{ paddingTop: '4rem', textAlign: 'center' }}>
        Loading exam…
      </div>
    );
  }

  if (phase === 'blocked') {
    return (
      <div className="container" style={{ paddingTop: '2rem' }}>
        <div className="alert alert-error">{error}</div>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/student')}>
          Back to dashboard
        </button>
      </div>
    );
  }

  const isExam = phase === 'exam';
  const question = isExam ? exam.questions[currentQ] : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {isExam && (
        <header
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <strong>{exam.title}</strong>
          <span
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: remaining < 60000 ? 'var(--danger)' : 'var(--primary)',
            }}
          >
            {formatTime(remaining)}
          </span>
        </header>
      )}

      <div className="container" style={{ paddingTop: isExam ? undefined : '2rem', maxWidth: isExam ? undefined : 720 }}>
        {!isExam && (
          <>
            <h1 className="page-title">{exam.title}</h1>
            <p className="page-sub">
              Share your <strong>entire screen</strong> and turn on your webcam before the exam begins.
            </p>
          </>
        )}

        {error && <div className="alert alert-error">{isExam ? error : error}</div>}

        {notifications.length > 0 && isExam && (
          <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
            <strong>Monitoring alert:</strong> {notifications[0]}
          </div>
        )}

        <div
          className={isExam ? 'grid-2' : undefined}
          style={{ marginTop: '1rem', alignItems: 'start' }}
        >
          <div>
            {isExam ? (
              <>
                <div className="exam-question-row">
                  <div className="exam-question-main card">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        marginBottom: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <p style={{ color: 'var(--muted)', margin: 0 }}>
                        Question {question.questionNumber ?? currentQ + 1} of {exam.questions.length}
                      </p>
                      <button
                        type="button"
                        className={`btn ${isFlagged(answers, currentQ) ? 'btn-primary' : 'btn-ghost'}`}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.85rem',
                          background: isFlagged(answers, currentQ)
                            ? 'rgba(234, 179, 8, 0.35)'
                            : undefined,
                          borderColor: isFlagged(answers, currentQ)
                            ? 'rgba(234, 179, 8, 0.8)'
                            : undefined,
                        }}
                        onClick={() => toggleFlag(currentQ)}
                      >
                        {isFlagged(answers, currentQ) ? 'Flagged' : 'Flag question'}
                      </button>
                    </div>
                    <h2 style={{ marginBottom: '1.25rem', fontSize: '1.15rem' }}>{question.text}</h2>
                    {(question.type || 'mcq') === 'short' ? (
                      <div className="form-group">
                        <label className="label">Your answer</label>
                        <input
                          className="input"
                          value={answers.find((a) => a.questionIndex === currentQ)?.textAnswer || ''}
                          onChange={(e) => setTextAnswer(currentQ, e.target.value)}
                          disabled={!proctoringReady}
                          placeholder="Type your answer"
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(question.options || []).map((opt, idx) => {
                          const selected =
                            answers.find((a) => a.questionIndex === currentQ)?.selectedIndex === idx;
                          return (
                            <label
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.75rem',
                                borderRadius: 8,
                                border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                                background: selected ? 'rgba(59,130,246,0.1)' : 'transparent',
                                cursor: proctoringReady ? 'pointer' : 'not-allowed',
                              }}
                            >
                              <input
                                type="radio"
                                name={`q-${currentQ}`}
                                checked={selected}
                                onChange={() => selectAnswer(currentQ, idx)}
                                disabled={!proctoringReady}
                              />
                              {opt}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={currentQ === 0}
                        onClick={() => setCurrentQ((q) => q - 1)}
                      >
                        Previous
                      </button>
                      {currentQ < exam.questions.length - 1 ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setCurrentQ((q) => q + 1)}
                        >
                          Next
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={submitting}
                          onClick={() => submitExam(false)}
                        >
                          {submitting ? 'Submitting…' : 'Submit exam'}
                        </button>
                      )}
                    </div>
                  </div>
                  <QuestionNavigator
                    total={exam.questions.length}
                    currentQ={currentQ}
                    answers={answers}
                    questions={exam.questions}
                    onJump={setCurrentQ}
                  />
                </div>
                <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {exam.rules}
                </p>
              </>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={!proctoringReady}
                  onClick={beginExam}
                >
                  Begin exam
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginTop: '0.75rem', width: '100%' }}
                  onClick={() => {
                    endSession();
                    navigate('/student');
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <ProctoringMonitor
            ref={proctoringRef}
            sessionId={session?._id}
            active={isExam}
            onRiskUpdate={handleRiskUpdate}
            onScreenShareLost={handleScreenShareLost}
            onReadyChange={setProctoringReady}
          />
        </div>
      </div>
    </div>
  );
}
