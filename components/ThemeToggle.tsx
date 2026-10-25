'use client';

import { useEffect, useState } from 'react';

/** Switches between the day board (cream paper) and the night board. */
export default function ThemeToggle() {
  const [night, setNight] = useState(false);

  useEffect(() => {
    setNight(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !night;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
    setNight(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn"
      aria-pressed={night}
      aria-label={night ? 'Switch to the day board' : 'Switch to the night board'}
      title={night ? 'Day board' : 'Night board'}
    >
      {night ? (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path
            d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
