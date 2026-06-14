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

function countAnswered(answers, questions) {
  return questions.reduce((n, q, i) => {
    const a = answers.find((x) => x.questionIndex === i);
    if ((q?.type || 'mcq') === 'short') return n + (a?.textAnswer?.trim() ? 1 : 0);
    return n + (a?.selectedIndex != null && a.selectedIndex >= 0 ? 1 : 0);
  }, 0);
}

const FORBIDDEN_SHORTCUT_KEYS = new Set(['c', 'v', 's', 'u', 'p']);

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
    </svg>
  );
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
  const [totalDuration, setTotalDuration] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [proctoringReady, setProctoringReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submitLockRef = useRef(false);
  const [strikes, setStrikes] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [displayLocked, setDisplayLocked] = useState(false);

  const checkDisplaySecurity = async () => {
    try {
      if (window.screen?.isExtended || window.screen?.width > 4096) {
        return false;
      }
      if (navigator.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (e) {
      console.log('Display check failed (expected in some browsers)', e);
    }
    return true;
  };

  const logSecurityEvent = async (type, message) => {
    if (!session) return;
    try {
      await api.postMonitoringEvent(session._id, {
        type,
        message,
        severity: 'high',
      });
    } catch (e) {
      console.error('Failed to log security event:', e);
    }
  };

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
          const left = new Date(status.session.endsAt) - Date.now();
          setRemaining(left);
          setTotalDuration(left);
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
    const displaySecure = await checkDisplaySecurity();
    if (!displaySecure) {
      setDisplayLocked(true);
      setError('Multiple displays detected. Please disconnect external monitors.');
      return;
    }
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) await elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) await elem.webkitRequestFullscreen();
      else if (elem.msRequestFullscreen) await elem.msRequestFullscreen();

      const sess = session || (await api.startSession(examId));
      setSession(sess);
      setAnswers(
        sess.answers?.length ? sess.answers : emptyAnswers(exam.questions)
      );
      const duration = new Date(sess.endsAt) - Date.now();
      setRemaining(duration);
      setTotalDuration(duration);
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

  const handleStrike = async (reason) => {
    const newStrikes = strikes + 1;
    setStrikes(newStrikes);
    await logSecurityEvent('violation', reason);

    if (newStrikes === 1) {
      setWarningMessage('⚠️ Warning! You have left the exam window. Return immediately or your session will be terminated.');
      setShowWarning(true);
    } else if (newStrikes === 2) {
      setWarningMessage('⚠️ FINAL WARNING! One more violation and your exam will be automatically submitted and flagged.');
      setShowWarning(true);
    } else if (newStrikes >= 3) {
      await logSecurityEvent('terminated', 'Session terminated after 3 violations');
      submitExam(true);
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

  useEffect(() => {
    if (phase !== 'exam') return undefined;

    const block = (e) => e.preventDefault();

    const handleKeyDown = (e) => {
      if (e.key === 'PrintScreen') {
        navigator.clipboard?.writeText('').catch(() => {});
        window.alert('Screenshots are disabled.');
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (FORBIDDEN_SHORTCUT_KEYS.has(e.key.toLowerCase())) {
          e.preventDefault();
          window.alert('This shortcut is disabled during the exam.');
        }
      }
    };

    let blurTimeout;
    const handleBlur = () => {
      clearTimeout(blurTimeout);
      blurTimeout = setTimeout(() => {
        handleStrike('Window lost focus');
      }, 100);
    };

    const handleFocus = () => {
      clearTimeout(blurTimeout);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleStrike('Tab switched or hidden');
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) elem.requestFullscreen().catch(() => {});
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen().catch(() => {});
        else if (elem.msRequestFullscreen) elem.msRequestFullscreen().catch(() => {});
      }
    };

    document.addEventListener('contextmenu', block);
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('dragstart', block);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('dragstart', block);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
      clearTimeout(blurTimeout);
    };
  }, [phase, session, strikes]);

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

  const handleFocusViolation = (message) => {
    setNotifications((prev) => [message, ...prev].slice(0, 5));
  };

  if (phase === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Preparing your exam environment…</p>
      </div>
    );
  }

  if (phase === 'blocked') {
    return (
      <div className="exam-shell">
        <div className="container" style={{ paddingTop: '3rem', maxWidth: 480 }}>
          <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
            <div className="alert alert-error">{error}</div>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/student')}>
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isExam = phase === 'exam';
  const question = isExam ? exam.questions[currentQ] : null;
  const urgent = remaining < 60000;
  const timePct = totalDuration > 0 ? Math.max(0, (remaining / totalDuration) * 100) : 0;
  const answeredCount = isExam ? countAnswered(answers, exam.questions) : 0;

  return (
    <div className={`exam-shell${isExam ? ' exam-locked' : ''}`}>
      {displayLocked && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.95)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          color: 'white',
          textAlign: 'center',
          padding: '2rem'
        }}>
          <h1 style={{ color: '#e74c3c' }}>⚠️ Security Alert</h1>
          <p style={{ fontSize: '1.25rem', marginBottom: '2rem' }}>
            Multiple displays detected. Please disconnect any external monitors and try again.
          </p>
          <button
            className="btn btn-primary"
            onClick={async () => {
              const secure = await checkDisplaySecurity();
              if (secure) setDisplayLocked(false);
            }}
          >
            Check Again
          </button>
        </div>
      )}

      {showWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          color: 'white'
        }}>
          <div style={{
            background: 'white',
            color: '#333',
            padding: '2rem',
            borderRadius: '0.5rem',
            maxWidth: '500px',
            textAlign: 'center'
          }}>
            <h2 style={{ color: strikes >= 2 ? '#e74c3c' : '#f39c12', marginBottom: '1rem' }}>
              {strikes >= 2 ? 'FINAL WARNING' : 'WARNING'}
            </h2>
            <p style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>
              {warningMessage}
            </p>
            <p style={{ marginBottom: '1.5rem', fontWeight: 'bold' }}>
              Strikes: {strikes} / 3
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setShowWarning(false)}
            >
              I Understand
            </button>
          </div>
        </div>
      )}

      {isExam && (
        <>
          <header className="exam-topbar">
            <div className="exam-topbar-left">
              <span className="exam-topbar-title">{exam.title}</span>
              <span className="exam-topbar-meta">Secure proctored session</span>
            </div>

            <div className="exam-topbar-center">
              <div className="exam-timer">
                <span className={`exam-timer-value${urgent ? ' exam-timer-value--urgent' : ''}`}>
                  {formatTime(remaining)}
                </span>
                <div className="exam-timer-bar">
                  <div
                    className={`exam-timer-bar-fill${urgent ? ' exam-timer-bar-fill--urgent' : ''}`}
                    style={{ width: `${timePct}%` }}
                  />
                </div>
              </div>
              <span className="exam-progress-pill">
                {answeredCount} / {exam.questions.length} answered
              </span>
              <span className="badge" style={{ marginLeft: '0.5rem', background: strikes > 0 ? '#e74c3c' : 'var(--success)' }}>
                STRIKES: {strikes}/3
              </span>
            </div>

            <span className="badge badge-live">SECURED</span>
          </header>

          <div className="exam-security-strip">
            <span className="exam-security-chip">
              <ShieldIcon /> Tab lock active
            </span>
            <span className="exam-security-chip">
              <ShieldIcon /> Copy / paste blocked
            </span>
            <span className="exam-security-chip">
              <ShieldIcon /> Screenshots restricted
            </span>
            <span className="exam-security-chip">
              <ShieldIcon /> AI monitoring on
            </span>
          </div>

          {notifications.length > 0 && (
            <div className="exam-toast-stack">
              {notifications.slice(0, 3).map((msg, i) => (
                <div key={`${msg}-${i}`} className="exam-toast">
                  <span className="exam-toast-icon">!</span>
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className={isExam ? 'exam-body' : 'container'} style={isExam ? undefined : { paddingTop: '2rem', maxWidth: 720 }}>
        {!isExam && (
          <div className="precheck-hero">
            <h1>{exam.title}</h1>
            <p>
              Complete the system check below. Your entire screen, webcam, and microphone are required
              before you can begin.
            </p>

            <div className="precheck-steps">
              <div className={`precheck-step${proctoringReady ? ' precheck-step--done' : ''}`}>
                <span className="precheck-step-num">{proctoringReady ? '✓' : '1'}</span>
                <div className="precheck-step-text">
                  <strong>Enable proctoring</strong>
                  <span>Share entire screen, webcam, and microphone</span>
                </div>
              </div>
              <div className="precheck-step">
                <span className="precheck-step-num">2</span>
                <div className="precheck-step-text">
                  <strong>Review exam rules</strong>
                  <span>{exam.rules || 'Follow all instructions from your instructor.'}</span>
                </div>
              </div>
              <div className="precheck-step">
                <span className="precheck-step-num">3</span>
                <div className="precheck-step-text">
                  <strong>Begin when ready</strong>
                  <span>The timer starts immediately once you begin</span>
                </div>
              </div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="precheck-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!proctoringReady}
                onClick={beginExam}
              >
                Begin exam
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  endSession();
                  navigate('/student');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isExam && error && <div className="alert alert-error">{error}</div>}

        <div className={isExam ? 'grid-2' : undefined} style={!isExam ? { marginTop: '1.5rem' } : undefined}>
          <div>
            {isExam ? (
              <>
                <div className="exam-question-row">
                  <div className="exam-question-main glass-card exam-question-card">
                    <div className="exam-question-header">
                      <span className="exam-question-label">
                        Question {question.questionNumber ?? currentQ + 1} of {exam.questions.length}
                      </span>
                      <button
                        type="button"
                        className={`btn-flag${isFlagged(answers, currentQ) ? ' btn-flag--active' : ''}`}
                        onClick={() => toggleFlag(currentQ)}
                      >
                        {isFlagged(answers, currentQ) ? '★ Flagged' : '☆ Flag for review'}
                      </button>
                    </div>

                    <h2 className="exam-question-text">{question.text}</h2>

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
                      <div className="exam-options">
                        {(question.options || []).map((opt, idx) => {
                          const selected =
                            answers.find((a) => a.questionIndex === currentQ)?.selectedIndex === idx;
                          return (
                            <label
                              key={idx}
                              className={`exam-option${selected ? ' exam-option--selected' : ''}${!proctoringReady ? ' exam-option--disabled' : ''}`}
                            >
                              <span className="exam-option-radio" />
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

                    <div className="exam-nav-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={currentQ === 0}
                        onClick={() => setCurrentQ((q) => q - 1)}
                      >
                        ← Previous
                      </button>
                      {currentQ < exam.questions.length - 1 ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setCurrentQ((q) => q + 1)}
                        >
                          Next →
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

                {exam.rules && <p className="exam-rules">{exam.rules}</p>}
              </>
            ) : null}
          </div>

          <ProctoringMonitor
            ref={proctoringRef}
            sessionId={session?._id}
            active={isExam}
            onRiskUpdate={handleRiskUpdate}
            onScreenShareLost={handleScreenShareLost}
            onFocusViolation={handleFocusViolation}
            onReadyChange={setProctoringReady}
          />
        </div>
      </div>
    </div>
  );
}
