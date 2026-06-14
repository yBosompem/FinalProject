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

function navButtonClass(index, currentQ, answers, questions) {
  const classes = ['question-nav-btn'];
  if (index === currentQ) classes.push('question-nav-btn--current');
  if (isFlagged(answers, index)) classes.push('question-nav-btn--flagged');
  else if (isAnsweredForQuestion(answers, index, questions)) classes.push('question-nav-btn--answered');
  return classes.join(' ');
}

export default function QuestionNavigator({ total, currentQ, answers, questions, onJump }) {
  return (
    <aside className="question-nav">
      <p className="question-nav-title">Questions</p>
      <div className="question-nav-grid">
        {Array.from({ length: total }, (_, i) => {
          const num = questions?.[i]?.questionNumber ?? i + 1;
          const answered = isAnsweredForQuestion(answers, i, questions);
          return (
            <button
              key={i}
              type="button"
              className={navButtonClass(i, currentQ, answers, questions)}
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
