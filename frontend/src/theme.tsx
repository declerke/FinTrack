import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

// Keep this key in sync with the pre-paint script in index.html.
const storageKey = 'fintrack-theme';
const systemQuery = '(prefers-color-scheme: dark)';
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

function savedTheme(): Theme | null {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    // Browser storage can be disabled.
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.(systemQuery).matches ? 'dark' : 'light';
}

function subscribeToSystemTheme(onChange: () => void) {
  const mediaQuery = window.matchMedia?.(systemQuery);
  mediaQuery?.addEventListener('change', onChange);
  return () => mediaQuery?.removeEventListener('change', onChange);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState(savedTheme);
  const preference = useSyncExternalStore(subscribeToSystemTheme, systemTheme);
  const theme = choice ?? preference;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setChoice(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // The choice still applies until the page is reloaded.
    }
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const settings = useContext(ThemeContext);
  if (!settings) return null;

  return (
    <button
      className="button button-quiet theme-toggle"
      type="button"
      aria-label="Dark mode"
      aria-pressed={settings.theme === 'dark'}
      title="Dark mode"
      onClick={settings.toggleTheme}
    >
      <span className="theme-toggle-icon" aria-hidden="true" />
      <span className="theme-toggle-label">Dark mode</span>
    </button>
  );
}
