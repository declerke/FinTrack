import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, getApiToken, onUnauthorized, setApiToken } from './api';

function response(status: number, body?: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn(async () => body),
    text: vi.fn(async () => body === undefined ? '' : JSON.stringify(body)),
  };
}

describe('API client', () => {
  afterEach(() => {
    setApiToken(null);
    vi.unstubAllGlobals();
  });

  it('accepts an empty 204 response without trying to parse a body', async () => {
    const empty = response(204);
    vi.stubGlobal('fetch', vi.fn(async () => empty));

    await expect(api.deleteTransaction(8)).resolves.toBeUndefined();
    expect(empty.json).not.toHaveBeenCalled();
    expect(empty.text).not.toHaveBeenCalled();
  });

  it('normalizes the error envelope and clears a protected session on 401', async () => {
    setApiToken('memory-only-token');
    const unauthorized = vi.fn();
    const unsubscribe = onUnauthorized(unauthorized);
    vi.stubGlobal('fetch', vi.fn(async () => response(401, {
      error: { code: 'invalid_token', message: 'Sign in again to continue.' },
    })));

    await expect(api.getPortfolios()).rejects.toMatchObject({
      message: 'Sign in again to continue.', status: 401, code: 'invalid_token',
    });
    expect(getApiToken()).toBeNull();
    expect(unauthorized).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
