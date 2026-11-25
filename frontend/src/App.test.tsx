import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { setApiToken } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('authentication route recovery', () => {
  beforeEach(() => setApiToken(null));
  afterEach(() => {
    setApiToken(null);
    vi.unstubAllGlobals();
  });

  it('returns to a requested portfolio detail after signing in', async () => {
    const requestPaths: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      requestPaths.push(url.pathname);
      if (url.pathname === '/api/auth/login') {
        return jsonResponse(200, { access_token: 'test-session-token', token_type: 'bearer', expires_in: 3600 });
      }
      if (url.pathname === '/api/portfolios/1') {
        return jsonResponse(404, { error: { code: 'portfolio_not_found', message: 'Portfolio not found.' } });
      }
      if (url.pathname === '/api/portfolios/1/transactions') return jsonResponse(200, []);
      if (url.pathname === '/api/portfolios/1/summary') {
        return jsonResponse(200, { portfolio_id: 1, base_currency: 'KES', total_invested: '0', estimated_value: '0', positions: [] });
      }
      if (url.pathname === '/api/portfolios') return jsonResponse(200, []);
      throw new Error(`Unexpected API request: ${url.pathname}`);
    }));

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/portfolios/1']}>
        <App />
      </MemoryRouter>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Username' }), 'luna-review-demo');
    await user.type(screen.getByLabelText('Password'), 'review-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Portfolio could not be loaded' })).toBeInTheDocument();
    expect(requestPaths).toContain('/api/portfolios/1');
    expect(requestPaths).not.toContain('/api/portfolios');
  });
});
