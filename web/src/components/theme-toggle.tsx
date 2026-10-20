'use client';

export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;
  }

  return (
    <button className="icon-btn" aria-label="切换明暗主题" onClick={toggle} title="切换明暗主题">
      <svg className="ic-moon" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
      <svg className="ic-sun" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
