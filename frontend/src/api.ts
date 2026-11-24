import type {
  AccessToken,
  Analyst,
  Credentials,
  Portfolio,
  PortfolioInput,
  PortfolioSummary,
  Transaction,
  TransactionInput,
} from './types';

type ErrorEnvelope = { error?: { code?: string; message?: string } };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 0, code = 'request_failed') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let apiToken: string | null = null;
const unauthorizedListeners = new Set<() => void>();
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export function setApiToken(token: string | null): void {
  apiToken = token;
}

export function getApiToken(): string | null {
  return apiToken;
}

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(): void {
  apiToken = null;
  unauthorizedListeners.forEach((listener) => listener());
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  protectedRequest = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (protectedRequest && apiToken) headers.set('Authorization', `Bearer ${apiToken}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  } catch {
    throw new ApiError('Could not reach FinTrack. Check your connection and try again.', 0, 'network_error');
  }

  if (response.status === 204) return undefined as T;

  const responseText = await response.text();
  let payload: unknown;
  if (responseText) {
    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && protectedRequest && apiToken) notifyUnauthorized();
    const envelope = payload as ErrorEnvelope | undefined;
    throw new ApiError(
      envelope?.error?.message || `FinTrack could not complete this request (${response.status}).`,
      response.status,
      envelope?.error?.code || 'request_failed',
    );
  }

  return payload as T;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export const api = {
  register(credentials: Credentials): Promise<Analyst> {
    return request('/api/auth/register', { method: 'POST', body: jsonBody(credentials) });
  },

  async login(credentials: Credentials): Promise<AccessToken> {
    const token = await request<AccessToken>('/api/auth/login', { method: 'POST', body: jsonBody(credentials) });
    setApiToken(token.access_token);
    return token;
  },

  getPortfolios(): Promise<Portfolio[]> {
    return request('/api/portfolios', {}, true);
  },

  createPortfolio(input: PortfolioInput): Promise<Portfolio> {
    return request('/api/portfolios', { method: 'POST', body: jsonBody(input) }, true);
  },

  updatePortfolio(id: number, input: PortfolioInput): Promise<Portfolio> {
    return request(`/api/portfolios/${id}`, { method: 'PUT', body: jsonBody(input) }, true);
  },

  deletePortfolio(id: number): Promise<void> {
    return request(`/api/portfolios/${id}`, { method: 'DELETE' }, true);
  },

  getPortfolio(id: number): Promise<Portfolio> {
    return request(`/api/portfolios/${id}`, {}, true);
  },

  getTransactions(portfolioId: number): Promise<Transaction[]> {
    return request(`/api/portfolios/${portfolioId}/transactions`, {}, true);
  },

  createTransaction(portfolioId: number, input: TransactionInput): Promise<Transaction> {
    return request(`/api/portfolios/${portfolioId}/transactions`, { method: 'POST', body: jsonBody(input) }, true);
  },

  deleteTransaction(id: number): Promise<void> {
    return request(`/api/transactions/${id}`, { method: 'DELETE' }, true);
  },

  getSummary(portfolioId: number): Promise<PortfolioSummary> {
    return request(`/api/portfolios/${portfolioId}/summary`, {}, true);
  },
};
