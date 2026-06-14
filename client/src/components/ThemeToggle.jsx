import { useTheme } from '../context/ThemeContext';
import { useState } from 'react';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    toggleTheme();
    setTimeout(() => setIsAnimating(false), 600);
  };

  return (
    <button
      className="theme-toggle-btn"
      onClick={handleClick}
      type="button"
      aria-label="Toggle theme"
    >
      <span className={`theme-icon ${isAnimating ? 'theme-icon--spin' : ''}`}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
    </button>
  );
}
