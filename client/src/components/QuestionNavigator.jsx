function getAnswer(answers, index) {
  return answers.find((a) => a.questionIndex === index);
}

function isAnswered(answers, index) {
  const a = getAnswer(answers, index);
  return a?.selectedIndex != null && a.selectedIndex >= 0;
}

function isFlagged(answers, index) {
  return Boolean(getAnswer(answers, index)?.flagged);
}

function isAnsweredForQuestion(answers, index, questions) {
  const a = getAnswer(answers, index);
  const q = questions?.[index];
  if ((q?.type || 'mcq') === 'short') {
    return Boolean(a?.textAnswer?.trim());
  }
  return isAnswered(answers, index);
}

function navButtonStyle(index, currentQ, answers, questions) {
  const base = {
    width: 40,
    height: 40,
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    color: 'var(--text)',
    transition: 'transform 0.1s, box-shadow 0.1s',
  };

  if (index === currentQ) {
    return {
      ...base,
      boxShadow: '0 0 0 2px var(--primary)',
      borderColor: 'var(--primary)',
    };
  }

  if (isFlagged(answers, index)) {
    return {
      ...base,
      background: 'rgba(234, 179, 8, 0.45)',
      borderColor: 'rgba(234, 179, 8, 0.8)',
    };
  }

  if (isAnsweredForQuestion(answers, index, questions)) {
    return {
      ...base,
      background: 'rgba(34, 197, 94, 0.3)',
      borderColor: 'rgba(34, 197, 94, 0.55)',
    };
  }

  return {
    ...base,
    background: 'rgba(239, 68, 68, 0.22)',
    borderColor: 'rgba(239, 68, 68, 0.45)',
  };
}

export default function QuestionNavigator({ total, currentQ, answers, questions, onJump }) {
  return (
    <aside className="question-nav">
      <p className="question-nav-title">Questions</p>
      <div className="question-nav-grid">
        {Array.from({ length: total }, (_, i) => {
          const num = questions?.[i]?.questionNumber ?? i + 1;
          const answered = isAnsweredForQuestion(answers, i, questions);
          const style = navButtonStyle(i, currentQ, answers, questions);
          return (
          <button
            key={i}
            type="button"
            className="question-nav-btn"
            style={style}
            onClick={() => onJump(i)}
            title={
              isFlagged(answers, i)
                ? `Question ${num} — flagged`
                : answered
                  ? `Question ${num} — answered`
                  : `Question ${num} — not answered`
            }
          >
            {num}
          </button>
        );
        })}
      </div>
      <ul className="question-nav-legend">
        <li>
          <span className="legend-swatch legend-answered" /> Answered
        </li>
        <li>
          <span className="legend-swatch legend-unanswered" /> Unanswered
        </li>
        <li>
          <span className="legend-swatch legend-flagged" /> Flagged
        </li>
      </ul>
    </aside>
  );
}

export { isAnswered, isFlagged };
