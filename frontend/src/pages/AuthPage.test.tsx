import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AccessToken, Analyst } from '../types';
import { AuthPage } from './AuthPage';

const apiMock = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));

vi.mock('../api', () => ({ api: apiMock }));

describe('AuthPage', () => {
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
      apiCall: apiMock.login,
      recoveryText: 'Portfolio workspace',
      response: { access_token: 'fictional-session-response', token_type: 'bearer' } satisfies AccessToken,
    },
    {
      mode: 'register',
      submitName: 'Create account',
      pendingName: 'Creating account…',
      failure: 'Unable to create an account.',
      apiCall: apiMock.register,
      recoveryText: 'Account created. Sign in to continue.',
      response: { id: 1, username: 'sample-analyst' } satisfies Analyst,
    },
  ] as const)('retains input and allows a retry after a failed $mode request', async ({
    mode, submitName, pendingName, failure, apiCall, recoveryText, response,
  }) => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    const passwordText = 'fictional-input';
    let rejectRequest!: (reason: Error) => void;
    apiCall
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; }))
      .mockResolvedValueOnce(response);

    render(
      <MemoryRouter initialEntries={[`/${mode}`]}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" onAuthenticated={onAuthenticated} />} />
          <Route path="/register" element={<AuthPage mode="register" onAuthenticated={onAuthenticated} />} />
          <Route path="/portfolios" element={<h1>Portfolio workspace</h1>} />
        </Routes>
      </MemoryRouter>,
    );

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
    expect(apiCall).toHaveBeenCalledTimes(1);

    await act(async () => { rejectRequest(new Error(failure)); });

    expect(await screen.findByRole('alert')).toHaveTextContent(failure);
    expect(username).toHaveValue('sample-analyst');
    expect(password).toHaveValue(passwordText);
    expect(submit).toBeEnabled();
    expect(onAuthenticated).not.toHaveBeenCalled();

    await user.click(submit);

    expect(await screen.findByText(recoveryText)).toBeVisible();
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    if (mode === 'login') {
      expect(onAuthenticated).toHaveBeenCalledExactlyOnceWith(response.access_token);
    } else {
      expect(onAuthenticated).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('');
      expect(screen.getByLabelText('Password')).toHaveValue('');
    }
  });
});
