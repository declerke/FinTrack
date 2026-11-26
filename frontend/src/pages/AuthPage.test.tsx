import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiToken, setApiToken } from '../api';
import type { AccessToken, Analyst } from '../types';
import { AuthPage } from './AuthPage';

function renderAuthPage(mode: 'login' | 'register', onAuthenticated: (token: string) => void) {
  return render(
    <MemoryRouter initialEntries={[`/${mode}`]}>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" onAuthenticated={onAuthenticated} />} />
        <Route path="/register" element={<AuthPage mode="register" onAuthenticated={onAuthenticated} />} />
        <Route path="/portfolios" element={<h1>Portfolio workspace</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function deferResponse() {
  let resolveResponse!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => { resolveResponse = resolve; });
  return { response, resolveResponse };
}

describe('AuthPage', () => {
  afterEach(() => {
    setApiToken(null);
    vi.unstubAllGlobals();
  });

  it('uses a username pattern accepted by modern HTML regular expression syntax', () => {
    render(
      <MemoryRouter>
        <AuthPage mode="login" onAuthenticated={() => undefined} />
      </MemoryRouter>,
    );

    const username = screen.getByRole('textbox', { name: 'Username' });
    const pattern = username.getAttribute('pattern');

    expect(pattern).not.toBeNull();
    expect(() => new RegExp(pattern ?? '', 'v')).not.toThrow();
    const usernamePattern = new RegExp(`^(?:${pattern ?? ''})$`, 'v');
    expect(usernamePattern.test('luna-demo-analyst')).toBe(true);
    expect(usernamePattern.test('invalid name')).toBe(false);
  });

  it.each([
    {
      mode: 'login',
      submitName: 'Sign in',
      pendingName: 'Signing in…',
      failure: 'Unable to sign in.',
      recoveryText: 'Portfolio workspace',
      response: { access_token: 'fictional-session-response', token_type: 'bearer' } satisfies AccessToken,
    },
    {
      mode: 'register',
      submitName: 'Create account',
      pendingName: 'Creating account…',
      failure: 'Unable to create an account.',
      recoveryText: 'Account created. Sign in to continue.',
      response: { id: 1, username: 'sample-analyst' } satisfies Analyst,
    },
  ] as const)('retains input and allows a retry after a failed $mode request', async ({
    mode, submitName, pendingName, failure, recoveryText, response,
  }) => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    const passwordText = 'fictional-input';
    const pendingRequest = deferResponse();
    const fetchRequest = vi.fn()
      .mockReturnValueOnce(pendingRequest.response)
      .mockResolvedValueOnce(Response.json(response));
    vi.stubGlobal('fetch', fetchRequest);

    renderAuthPage(mode, onAuthenticated);

    const username = screen.getByRole('textbox', { name: 'Username' });
    const password = screen.getByLabelText('Password');
    const submit = screen.getByRole('button', { name: submitName });
    await user.type(username, 'sample-analyst');
    await user.type(password, passwordText);
    await user.click(submit);

    expect(submit).toHaveAccessibleName(pendingName);
    expect(submit).toBeDisabled();
    expect(username).toBeDisabled();
    expect(password).toBeDisabled();
    await user.click(submit);
    expect(fetchRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingRequest.resolveResponse(Response.json({ error: { message: failure } }, { status: 400 }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(failure);
    expect(username).toHaveValue('sample-analyst');
    expect(password).toHaveValue(passwordText);
    expect(submit).toBeEnabled();
    expect(onAuthenticated).not.toHaveBeenCalled();

    await user.click(submit);

    expect(await screen.findByText(recoveryText)).toBeVisible();
    expect(fetchRequest).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    if (mode === 'login') {
      expect(onAuthenticated).toHaveBeenCalledExactlyOnceWith(response.access_token);
    } else {
      expect(onAuthenticated).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('');
      expect(screen.getByLabelText('Password')).toHaveValue('');
    }
  });

  it.each(['mode switch', 'unmount'] as const)('ignores a successful sign-in after %s', async (departure) => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    const pendingRequest = deferResponse();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pendingRequest.response));

    const { unmount } = renderAuthPage('login', onAuthenticated);
    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'sample-analyst');
    await user.type(screen.getByLabelText('Password'), 'fictional-input');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    if (departure === 'mode switch') {
      await user.click(screen.getByRole('link', { name: 'Create an account' }));
      expect(screen.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    } else {
      unmount();
    }

    await act(async () => {
      pendingRequest.resolveResponse(Response.json({
        access_token: 'fictional-session-response',
        token_type: 'bearer',
      } satisfies AccessToken));
    });

    expect(getApiToken()).toBeNull();
    expect(onAuthenticated).not.toHaveBeenCalled();
    if (departure === 'mode switch') {
      expect(screen.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    }
  });

  it('keeps the current registration form when an abandoned registration completes', async () => {
    const user = userEvent.setup();
    const pendingRequest = deferResponse();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pendingRequest.response));

    renderAuthPage('register', () => undefined);
    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'sample-analyst');
    await user.type(screen.getByLabelText('Password'), 'fictional-input');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    await user.click(screen.getByRole('link', { name: 'Create an account' }));
    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'another-analyst');

    await act(async () => {
      pendingRequest.resolveResponse(Response.json({ id: 1, username: 'sample-analyst' } satisfies Analyst));
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('another-analyst');
  });
});
