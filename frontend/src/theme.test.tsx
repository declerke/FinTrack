import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import documentShell from '../index.html?raw';
import App from './App';
import { setApiToken } from './api';

function systemTheme(startsDark: boolean) {
  const mediaQuery = new EventTarget();
  let matches = startsDark;
  Object.defineProperty(mediaQuery, 'matches', { get: () => matches });
  vi.stubGlobal('matchMedia', () => mediaQuery);

  return (prefersDark: boolean) => {
    matches = prefersDark;
    mediaQuery.dispatchEvent(new Event('change'));
  };
}

function renderApp(path = '/login') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe('color theme', () => {
  afterEach(() => {
    setApiToken(null);
    window.localStorage.removeItem('fintrack-theme');
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
  });

  it.each([
    [true, null, 'dark'],
    [false, null, 'light'],
    [true, 'light', 'light'],
    [false, 'dark', 'dark'],
  ] as const)(
    'sets the initial theme before the app mounts (prefers dark: %s, saved: %s)',
    (prefersDark, saved, theme) => {
      systemTheme(prefersDark);
      if (saved) window.localStorage.setItem('fintrack-theme', saved);
      const page = new DOMParser().parseFromString(documentShell, 'text/html');
      const bootstrap = page.head.querySelector('script:not([src])');

      const runBootstrap = new Function('window', 'document', bootstrap?.textContent ?? '');
      runBootstrap(window, page);

      expect(page.documentElement.dataset.theme).toBe(theme);
      expect(window.localStorage.getItem('fintrack-theme')).toBe(saved);
    },
  );

  it('updates with the system preference until a theme is chosen', () => {
    const changeSystemTheme = systemTheme(true);
    renderApp();

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true');

    act(() => changeSystemTheme(false));

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem('fintrack-theme')).toBeNull();
  });

  it('persists an explicit theme across app mounts and system changes', async () => {
    const changeSystemTheme = systemTheme(true);
    const user = userEvent.setup();
    const firstMount = renderApp();
    await user.click(screen.getByRole('button', { name: 'Dark mode' }));

    expect(window.localStorage.getItem('fintrack-theme')).toBe('light');
    firstMount.unmount();
    renderApp('/register');

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'false');

    act(() => changeSystemTheme(false));
    act(() => changeSystemTheme(true));

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('can switch themes with the keyboard on the sign-in page', async () => {
    systemTheme(false);
    const user = userEvent.setup();
    renderApp();
    const toggle = screen.getByRole('button', { name: 'Dark mode' });

    await user.tab();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('provides the same named toggle in the signed-in header', async () => {
    systemTheme(false);
    setApiToken('signed-in');
    vi.stubGlobal('fetch', async () => Response.json([]));
    const user = userEvent.setup();
    renderApp('/portfolios');
    await screen.findByRole('heading', { name: 'Your workspace is ready' });

    const toggle = screen.getByRole('button', { name: 'Dark mode' });
    expect(screen.getByRole('banner')).toContainElement(toggle);
    await user.click(toggle);

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
