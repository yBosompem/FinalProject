import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import ThemeToggle from '../../components/ThemeToggle';
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
const FUNCTION_KEYS = new Set(Array.from({ length: 12 }, (_, i) => `F${i + 1}`));
const FONT_OPTIONS = [
  { value: 'system', label: 'System default' },
  { value: 'arial', label: 'Arial', stack: "Arial, Helvetica, sans-serif" },
  { value: 'verdana', label: 'Verdana', stack: "Verdana, Geneva, sans-serif" },
  { value: 'tahoma', label: 'Tahoma', stack: "Tahoma, Geneva, sans-serif" },
  { value: 'trebuchet', label: 'Trebuchet MS', stack: "'Trebuchet MS', Arial, sans-serif" },
  { value: 'calibri', label: 'Calibri', stack: "Calibri, Candara, Segoe, sans-serif" },
  { value: 'segoe', label: 'Segoe UI', stack: "'Segoe UI', Arial, sans-serif" },
  { value: 'lucida', label: 'Lucida Sans', stack: "'Lucida Sans Unicode', 'Lucida Grande', sans-serif" },
  { value: 'georgia', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { value: 'times', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { value: 'cambria', label: 'Cambria', stack: "Cambria, Georgia, serif" },
  { value: 'courier', label: 'Courier New', stack: "'Courier New', Courier, monospace" },
  { value: 'consolas', label: 'Consolas', stack: "Consolas, 'Courier New', monospace" },
  { value: 'readable', label: 'High readability', stack: "Verdana, 'Atkinson Hyperlegible', Arial, sans-serif" },
];

function getReadingFont(font) {
  return FONT_OPTIONS.find((option) => option.value === font)?.stack || 'inherit';
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
    </svg>
  );
}

function CalculatorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M8 6h8M8 10h2M12 10h2M16 10h0M8 14h2M12 14h2M16 14h0M8 18h2M12 18h2M16 18h0" />
    </svg>
  );
}

const FALLBACK_FUNCTION_BUTTONS = [
  [
    { label: 'sin', value: 'sin(' },
    { label: 'cos', value: 'cos(' },
    { label: 'tan', value: 'tan(' },
    { label: 'sin^-1', value: 'asin(' },
    { label: 'cos^-1', value: 'acos(' },
  ],
  [
    { label: 'tan^-1', value: 'atan(' },
    { label: 'sinh', value: 'sinh(' },
    { label: 'cosh', value: 'cosh(' },
    { label: 'tanh', value: 'tanh(' },
    { label: 'sec', value: 'sec(' },
  ],
  [
    { label: 'csc', value: 'csc(' },
    { label: 'cot', value: 'cot(' },
    { label: 'sqrt', value: 'sqrt(' },
    { label: '|x|', value: 'abs(' },
    { label: 'exp', value: 'exp(' },
  ],
  ['ln(', 'log(', 'sqrt(', '^', '%'],
];
const FALLBACK_NUMBER_BUTTONS = [
  ['C', 'DEL', '(', ')'],
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['+/-', '0', '.', '+'],
  ['pi', 'e', 'ans', '='],
];
const FALLBACK_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'sec',
  'csc',
  'cot',
  'ln',
  'log',
  'sqrt',
  'abs',
  'exp',
]);
const FALLBACK_CONSTANTS = { pi: Math.PI, e: Math.E };
const FALLBACK_OPERATORS = {
  '+': { precedence: 1, associativity: 'left' },
  '-': { precedence: 1, associativity: 'left' },
  '*': { precedence: 2, associativity: 'left' },
  '/': { precedence: 2, associativity: 'left' },
  '^': { precedence: 3, associativity: 'right' },
  'u-': { precedence: 4, associativity: 'right' },
  '%': { precedence: 5, associativity: 'left' },
};

function tokenizeFallback(input) {
  const normalized = String(input || '')
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('π', 'pi')
    .toLowerCase();
  const tokens = [];
  let i = 0;

  while (i < normalized.length) {
    const char = normalized[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (/\d|\./.test(char)) {
      let value = char;
      i += 1;
      while (i < normalized.length && /[\d.]/.test(normalized[i])) {
        value += normalized[i];
        i += 1;
      }
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error('Invalid number');
      tokens.push({ type: 'number', value: number });
      continue;
    }
    if (/[a-z]/.test(char)) {
      let value = char;
      i += 1;
      while (i < normalized.length && /[a-z]/.test(normalized[i])) {
        value += normalized[i];
        i += 1;
      }
      if (FALLBACK_FUNCTIONS.has(value)) tokens.push({ type: 'function', value });
      else if (Object.prototype.hasOwnProperty.call(FALLBACK_CONSTANTS, value)) {
        tokens.push({ type: 'number', value: FALLBACK_CONSTANTS[value] });
      } else throw new Error('Unknown function');
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: char === '(' ? 'leftParen' : 'rightParen', value: char });
      i += 1;
      continue;
    }
    if ('+-*/^%'.includes(char)) {
      const previous = tokens[tokens.length - 1];
      tokens.push({
        type: 'operator',
        value:
          char === '-' &&
          (!previous || previous.type === 'operator' || previous.type === 'leftParen' || previous.type === 'function')
            ? 'u-'
            : char,
      });
      i += 1;
      continue;
    }
    throw new Error('Unsupported input');
  }
  return tokens;
}

function toFallbackRpn(tokens) {
  const output = [];
  const stack = [];
  tokens.forEach((token) => {
    if (token.type === 'number') output.push(token);
    else if (token.type === 'function' || token.type === 'leftParen') stack.push(token);
    else if (token.type === 'operator') {
      const op = FALLBACK_OPERATORS[token.value];
      while (stack.length) {
        const top = stack[stack.length - 1];
        const topOp = FALLBACK_OPERATORS[top.value];
        if (
          top.type === 'function' ||
          (top.type === 'operator' &&
            (topOp.precedence > op.precedence ||
              (topOp.precedence === op.precedence && op.associativity === 'left')))
        ) {
          output.push(stack.pop());
        } else break;
      }
      stack.push(token);
    } else if (token.type === 'rightParen') {
      while (stack.length && stack[stack.length - 1].type !== 'leftParen') output.push(stack.pop());
      if (!stack.length) throw new Error('Mismatched parentheses');
      stack.pop();
      if (stack[stack.length - 1]?.type === 'function') output.push(stack.pop());
    }
  });
  while (stack.length) {
    const token = stack.pop();
    if (token.type === 'leftParen') throw new Error('Mismatched parentheses');
    output.push(token);
  }
  return output;
}

function evaluateFallbackRpn(rpn, angleMode) {
  const stack = [];
  const radians = (value) => (angleMode === 'deg' ? (value * Math.PI) / 180 : value);
  const displayAngle = (value) => (angleMode === 'deg' ? (value * 180) / Math.PI : value);
  rpn.forEach((token) => {
    if (token.type === 'number') {
      stack.push(token.value);
      return;
    }
    if (token.type === 'function') {
      const value = stack.pop();
      if (value == null) throw new Error('Missing value');
      const results = {
        sin: Math.sin(radians(value)),
        cos: Math.cos(radians(value)),
        tan: Math.tan(radians(value)),
        asin: displayAngle(Math.asin(value)),
        acos: displayAngle(Math.acos(value)),
        atan: displayAngle(Math.atan(value)),
        sinh: Math.sinh(value),
        cosh: Math.cosh(value),
        tanh: Math.tanh(value),
        sec: 1 / Math.cos(radians(value)),
        csc: 1 / Math.sin(radians(value)),
        cot: 1 / Math.tan(radians(value)),
        ln: Math.log(value),
        log: Math.log10(value),
        sqrt: Math.sqrt(value),
        abs: Math.abs(value),
        exp: Math.exp(value),
      };
      stack.push(results[token.value]);
      return;
    }
    if (token.value === '%') {
      const value = stack.pop();
      if (value == null) throw new Error('Missing value');
      stack.push(value / 100);
      return;
    }
    if (token.value === 'u-') {
      const value = stack.pop();
      if (value == null) throw new Error('Missing value');
      stack.push(-value);
      return;
    }
    const right = stack.pop();
    const left = stack.pop();
    if (left == null || right == null) throw new Error('Missing value');
    if (token.value === '+') stack.push(left + right);
    if (token.value === '-') stack.push(left - right);
    if (token.value === '*') stack.push(left * right);
    if (token.value === '/') stack.push(left / right);
    if (token.value === '^') stack.push(left ** right);
  });
  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error('Invalid calculation');
  return stack[0];
}

function calculateFallback(input, angleMode) {
  return evaluateFallbackRpn(toFallbackRpn(tokenizeFallback(input)), angleMode);
}

function formatFallback(value) {
  if (Math.abs(value) >= 1e10 || (Math.abs(value) > 0 && Math.abs(value) < 1e-7)) {
    return value.toExponential(8);
  }
  return String(Number(value.toPrecision(12)));
}

function FallbackCalculator() {
  const [angleMode, setAngleMode] = useState('deg');
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('Ready');
  const [error, setError] = useState('');

  const appendValue = (value) => {
    setExpression((current) => `${current}${value}`);
    setError('');
  };
  const calculate = () => {
    try {
      const value = calculateFallback(expression, angleMode);
      const formatted = formatFallback(value);
      setExpression(formatted);
      setResult(formatted);
      setError('');
    } catch (err) {
      setError(err.message || 'Invalid calculation');
    }
  };
  const handleCalculatorButton = (value) => {
    if (value === '=') calculate();
    else if (value === 'C') {
      setExpression('');
      setResult('Ready');
      setError('');
    } else if (value === 'DEL') setExpression((current) => current.slice(0, -1));
    else if (value === '+/-') setExpression((current) => (current.startsWith('-') ? current.slice(1) : `-${current}`));
    else if (value === 'ans') appendValue(result !== 'Ready' && !error ? result : '');
    else appendValue(value);
  };

  return (
    <div className="exam-fallback-calc">
      <div className="exam-fallback-display">
        <input
          value={expression}
          onChange={(e) => {
            setExpression(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') calculate();
          }}
          placeholder="0"
        />
        <div className={`exam-fallback-result${error ? ' exam-fallback-result--error' : ''}`}>
          {error || result}
        </div>
      </div>
      <div className="exam-fallback-actions">
        <button type="button" onClick={() => setAngleMode((mode) => (mode === 'deg' ? 'rad' : 'deg'))}>
          {angleMode.toUpperCase()}
        </button>
        <button type="button" onClick={() => appendValue('e')}>e</button>
        <button type="button" onClick={() => setExpression((current) => current.slice(0, -1))}>DEL</button>
        <button
          type="button"
          onClick={() => {
            setExpression('');
            setResult('Ready');
            setError('');
          }}
        >
          AC
        </button>
      </div>
      <div className="exam-fallback-keypad">
        <div className="exam-fallback-grid exam-fallback-science">
          {FALLBACK_FUNCTION_BUTTONS.flat().map((button) => {
            const value = typeof button === 'string' ? button : button.value;
            const label = typeof button === 'string' ? button : button.label;
            return (
              <button type="button" key={`${label}-${value}`} onClick={() => handleCalculatorButton(value)}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="exam-fallback-grid exam-fallback-number-pad">
          {FALLBACK_NUMBER_BUTTONS.flat().map((value) => (
            <button
              type="button"
              key={value}
              className={value === '=' ? 'exam-fallback-equals' : undefined}
              onClick={() => handleCalculatorButton(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScientificCalculator({ allowed, open, onToggle }) {
  if (!allowed) {
    return (
      <button type="button" className="exam-tool-btn" disabled title="Calculator disabled by lecturer">
        <CalculatorIcon />
        <span>Calculator off</span>
      </button>
    );
  }

  return (
    <div className="exam-calculator-wrap">
      <button
        type="button"
        className="exam-tool-btn"
        onClick={onToggle}
        aria-expanded={open}
      >
        <CalculatorIcon />
        <span>{open ? 'Hide calculator' : 'Calculator'}</span>
      </button>
    </div>
  );
}

function InPageCalculatorPanel({ onClose }) {
  return (
    <div className="exam-calculator-panel">
      <div className="exam-calculator-header">
        <span>Desmos scientific calculator</span>
        <button
          type="button"
          className="exam-tool-icon-btn"
          onClick={onClose}
          aria-label="Close calculator"
        >
          x
        </button>
      </div>
      <iframe
        title="Desmos scientific calculator"
        src="https://www.desmos.com/scientific"
        className="exam-desmos-frame"
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
      />
    </div>
  );
}

function ReadingControls({ fontScale, fontFamily, onFontScaleChange, onFontFamilyChange }) {
  return (
    <div className="exam-reading-controls" aria-label="Reading preferences">
      <label>
        <span>Text size</span>
        <input
          type="range"
          min="0.95"
          max="2.4"
          step="0.05"
          value={fontScale}
          onChange={(e) => onFontScaleChange(Number(e.target.value))}
        />
        <output>{Math.round(fontScale * 100)}%</output>
      </label>
      <label>
        <span>Font</span>
        <select value={fontFamily} onChange={(e) => onFontFamilyChange(e.target.value)}>
          {FONT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
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
  const [proctoringReady, setProctoringReady] = useState(false);
  const [webcamReady, setWebcamReady] = useState(false);
  const [screenReady, setScreenReady] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submitLockRef = useRef(false);
  const strikeRef = useRef(0);
  const lastStrikeAtRef = useRef(0);
  const [strikes, setStrikes] = useState(0);
  const [showStrikeWarning, setShowStrikeWarning] = useState(false);
  const [strikeWarning, setStrikeWarning] = useState({ count: 0, message: '' });
  const [displayLocked, setDisplayLocked] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [fontFamily, setFontFamily] = useState('system');
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  const checkDisplaySecurity = async () => {
    try {
      if (window.screen?.isExtended || window.screen?.width > 4096) {
        return false;
      }
    } catch (e) {
      console.log('Display check failed (expected in some browsers)', e);
    }
    return true;
  };

  const returnToExamMode = useCallback(async () => {
    if (window.electronAPI) {
      window.electronAPI.enterExamMode();
    }

    const elem = document.documentElement;
    try {
      if (elem.requestFullscreen) await elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) await elem.webkitRequestFullscreen();
      else if (elem.msRequestFullscreen) await elem.msRequestFullscreen();
    } catch (err) {
      console.log('Could not restore fullscreen automatically', err);
    }
  }, []);

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
      setShowStrikeWarning(false);
      const recordingUpload = proctoringRef.current?.uploadRecording?.();
      endSession();
      if (window.electronAPI) {
        window.electronAPI.exitExamMode();
      }
      try {
        const result = await api.submitSession(session._id, { answers, autoSubmit });
        recordingUpload?.catch((recordingErr) => {
          console.warn('Recording upload failed after final submission:', recordingErr.message);
        });
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

        setPhase('precheck-camera');
      } catch (err) {
        setError(err.message);
        setPhase('blocked');
      }
    }
    init();
  }, [examId]);

  const beginExam = async () => {
    if (!rulesAccepted) {
      setError('Read and accept the exam rules before starting.');
      return;
    }
    if (!proctoringReady) {
      setError('Enable webcam, microphone, and entire-screen sharing before starting.');
      return;
    }
    const displaySecure = await checkDisplaySecurity();
    if (!displaySecure) {
      setDisplayLocked(true);
      setError('Multiple displays detected. Please disconnect external monitors.');
      return;
    }
    try {
      await returnToExamMode();

      const sess = session || (await api.startSession(examId));
      setSession(sess);
      setAnswers(
        sess.answers?.length ? sess.answers : emptyAnswers(exam.questions)
      );
      const duration = new Date(sess.endsAt) - Date.now();
      setRemaining(duration);
      setTotalDuration(duration);
      strikeRef.current = 0;
      setStrikes(0);
      setShowStrikeWarning(false);
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

  const goToScreenShare = () => {
    if (!webcamReady) {
      setError('Enable your webcam and microphone before continuing.');
      return;
    }
    setError('');
    setPhase('precheck-screen');
  };

  const goToRules = () => {
    if (!screenReady) {
      setError('Share your entire screen before continuing.');
      return;
    }
    setError('');
    setRulesAccepted(false);
    setPhase('precheck-rules');
  };

  const handleStrike = async (reason) => {
    if (submitLockRef.current || strikeRef.current >= 3) return;
    const now = Date.now();
    if (now - lastStrikeAtRef.current < 750) return;
    lastStrikeAtRef.current = now;

    const newStrikes = Math.min(strikeRef.current + 1, 3);
    strikeRef.current = newStrikes;
    setStrikes(newStrikes);
    logSecurityEvent('violation', reason);

    if (newStrikes >= 3) {
      setShowStrikeWarning(false);
      if (window.electronAPI) {
        window.electronAPI.exitExamMode();
      }
      logSecurityEvent('terminated', 'Session terminated after 3 violations');
      submitExam(true);
      return;
    }

    setStrikeWarning({
      count: newStrikes,
      message:
        newStrikes === 1
          ? 'Warning 1 of 3: you exited fullscreen. You must stay in secure exam mode. The 3rd fullscreen exit will automatically submit and end your exam.'
          : 'Final warning 2 of 3: you exited fullscreen again. One more fullscreen exit will automatically submit and end your exam.',
    });
    setShowStrikeWarning(true);
    if (window.electronAPI) {
      window.electronAPI.enterExamMode();
    }
  };

  useEffect(() => {
    return () => {
      if (window.electronAPI) {
        window.electronAPI.exitExamMode();
      }
    };
  }, []);

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
    if (phase !== 'exam' || !session || !window.electronAPI?.onExternalDeviceConnected) {
      return undefined;
    }

    return window.electronAPI.onExternalDeviceConnected((device) => {
      const message = `External device connected during exam: ${device.name || 'unknown device'}`;
      api.postMonitoringEvent(session._id, {
        type: 'external_device_connected',
        message,
        severity: device.deviceClass === 'DiskDrive' || device.deviceClass === 'WPD' ? 'high' : 'medium',
        metadata: device,
      }).catch(() => {});
    });
  }, [phase, session]);

  useEffect(() => {
    if (phase !== 'exam') return undefined;

    const block = (e) => e.preventDefault();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleStrike('Escape pressed during exam');
        return;
      }

      if (FUNCTION_KEYS.has(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.key === 'PrintScreen') {
        e.preventDefault();
        navigator.clipboard?.writeText('').catch(() => {});
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (FORBIDDEN_SHORTCUT_KEYS.has(e.key.toLowerCase())) {
          e.preventDefault();
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleStrike('Tab switched or hidden');
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        handleStrike('Fullscreen exited');
      }
    };

    document.addEventListener('contextmenu', block);
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('dragstart', block);
    document.addEventListener('keydown', handleKeyDown);
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, [phase, session, strikes, returnToExamMode]);

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

  const handleRiskUpdate = () => {
    // AI events are recorded by the monitoring service; keep the exam UI distraction-free.
  };

  const handleScreenShareLost = () => {
    setProctoringReady(false);
  };

  const handleFocusViolation = () => {
    // Focus violations are logged silently and handled by the strike policy.
  };

  const handleProctoringStatus = useCallback((status) => {
    setWebcamReady(status.webcamReady);
    setScreenReady(status.screenReady);
    setProctoringReady(status.proctoringReady);
  }, []);

  useEffect(() => {
    setCalculatorOpen(Boolean(exam?.allowScientificCalculator));
  }, [exam?.allowScientificCalculator]);

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
  const isCameraCheck = phase === 'precheck-camera';
  const isScreenCheck = phase === 'precheck-screen';
  const isRulesCheck = phase === 'precheck-rules';
  const setupMode = isCameraCheck ? 'webcam' : isScreenCheck ? 'screen' : 'all';
  const question = isExam ? exam.questions[currentQ] : null;
  const urgent = remaining < 60000;
  const timePct = totalDuration > 0 ? Math.max(0, (remaining / totalDuration) * 100) : 0;
  const answeredCount = isExam ? countAnswered(answers, exam.questions) : 0;
  const visibleStrikes = Math.min(strikes, 3);
  const readingStyle = {
    '--exam-reading-scale': fontScale,
    '--exam-reading-font': getReadingFont(fontFamily),
  };

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

      {showStrikeWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          color: 'white',
          padding: '1.5rem'
        }}>
          <div style={{
            width: 'min(480px, 100%)',
            background: '#111827',
            border: '1px solid #f59e0b',
            boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            color: 'white',
            padding: '2rem',
            borderRadius: '0.5rem',
            textAlign: 'center'
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: '2px solid #f59e0b',
              color: '#f59e0b',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              fontWeight: 800,
              marginBottom: '1rem'
            }}>
              !
            </div>
            <h2 style={{ color: '#f59e0b', marginBottom: '1rem' }}>
              {strikeWarning.count === 1 ? 'Fullscreen Warning' : 'Final Fullscreen Warning'}
            </h2>
            <p style={{ marginBottom: '1rem', fontSize: '1.05rem', lineHeight: 1.5 }}>
              {strikeWarning.message}
            </p>
            <p style={{ marginBottom: '1.5rem', fontWeight: 700 }}>
              Strike {strikeWarning.count} / 3
            </p>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                await returnToExamMode();
                setShowStrikeWarning(false);
              }}
            >
              OK - return to exam mode
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
              <span className="badge" style={{ marginLeft: '0.5rem', background: visibleStrikes > 0 ? '#e74c3c' : 'var(--success)' }}>
                STRIKES: {visibleStrikes}/3
              </span>
            </div>

            <div className="exam-topbar-actions">
              <ThemeToggle />
              <span className="badge badge-live">SECURED</span>
            </div>
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
            <span className="exam-security-chip">
              <ShieldIcon /> External device watch
            </span>
            <span className="exam-security-chip">
              <ShieldIcon /> Function keys blocked
            </span>
          </div>

        </>
      )}

      <div className={isExam ? 'exam-body' : 'container'} style={isExam ? undefined : { paddingTop: '2rem', maxWidth: 720 }}>
        {(isCameraCheck || isScreenCheck || isRulesCheck || isExam) && (
          <div style={isRulesCheck || isExam ? { display: 'none' } : undefined}>
            {(isCameraCheck || isScreenCheck) && (
              <div className="precheck-hero">
                <h1>{exam.title}</h1>
                <p>
                  {isCameraCheck
                    ? 'Step 1: enable your webcam and microphone. Keep your face clearly visible before continuing.'
                    : 'Step 2: share your entire screen. Do not choose a browser tab or a single window.'}
                </p>
              </div>
            )}
            <ProctoringMonitor
              ref={proctoringRef}
              sessionId={session?._id}
              active={isExam}
              setupMode={setupMode}
              examContext={exam}
              onRiskUpdate={handleRiskUpdate}
              onScreenShareLost={handleScreenShareLost}
              onFocusViolation={handleFocusViolation}
              onReadyChange={setProctoringReady}
              onStatusChange={handleProctoringStatus}
            />
            {(isCameraCheck || isScreenCheck) && (
              <>
                {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}
                <div className="precheck-actions" style={{ marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isCameraCheck ? !webcamReady : !screenReady}
                    onClick={isCameraCheck ? goToScreenShare : goToRules}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      if (isScreenCheck) {
                        setPhase('precheck-camera');
                        return;
                      }
                      endSession();
                      navigate('/student');
                    }}
                  >
                    {isScreenCheck ? 'Back' : 'Cancel'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {isRulesCheck && (
          <div>
            <div className="precheck-hero">
              <h1>{exam.title}</h1>
              <p>{exam.description || 'Review the exam rules carefully before starting.'}</p>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Exam rules</h2>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {exam.rules || 'Follow all instructions from your instructor.'}
              </div>
            </div>

            <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <input
                type="checkbox"
                checked={rulesAccepted}
                onChange={(e) => {
                  setRulesAccepted(e.target.checked);
                  if (e.target.checked) setError('');
                }}
                style={{ marginTop: '0.2rem' }}
              />
              <span>I have read and accepted the exam rules.</span>
            </label>

            {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

            <div className="precheck-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!rulesAccepted || !proctoringReady}
                onClick={beginExam}
              >
                Begin exam
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPhase('precheck-screen')}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {isExam && error && <div className="alert alert-error">{error}</div>}

        <div style={!isExam ? { marginTop: '1.5rem' } : undefined}>
          <div>
            {isExam ? (
              <>
                <div className="exam-question-row">
                  {exam.rules && (
                    <aside className="exam-rules-card exam-rules-card--side">
                      <h2>Exam rules</h2>
                      <div className="exam-rules-content">{exam.rules}</div>
                    </aside>
                  )}

                  <div className="exam-workspace">
                  <div className="exam-question-main glass-card exam-question-card" style={readingStyle}>
                    <div className="exam-question-header">
                      <div className="exam-question-tools">
                        <ReadingControls
                          fontScale={fontScale}
                          fontFamily={fontFamily}
                          onFontScaleChange={setFontScale}
                          onFontFamilyChange={setFontFamily}
                        />
                        <ScientificCalculator
                          allowed={Boolean(exam.allowScientificCalculator)}
                          open={calculatorOpen}
                          onToggle={() => setCalculatorOpen((open) => !open)}
                        />
                        <button
                          type="button"
                          className={`btn-flag${isFlagged(answers, currentQ) ? ' btn-flag--active' : ''}`}
                          onClick={() => toggleFlag(currentQ)}
                        >
                          {isFlagged(answers, currentQ) ? 'Flagged' : 'Flag'}
                        </button>
                      </div>
                      <span className="exam-question-label">
                        Question {question.questionNumber ?? currentQ + 1} of {exam.questions.length}
                      </span>
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
                              <span className="exam-option-letter">{String.fromCharCode(65 + idx)}</span>
                              <span>{opt}</span>
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

                  {calculatorOpen && Boolean(exam.allowScientificCalculator) && (
                    <section className="exam-calculator-section">
                      <InPageCalculatorPanel onClose={() => setCalculatorOpen(false)} />
                    </section>
                  )}
                  </div>
                </div>

              </>
            ) : null}
          </div>

        </div>
      </div>
    </div>
  );
}
