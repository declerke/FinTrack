import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../styles.css';
import type { Portfolio, PortfolioSummary, Transaction } from '../types';
import { PortfolioPage } from './PortfolioPage';

const apiMock = vi.hoisted(() => ({
  getPortfolio: vi.fn(),
  getTransactions: vi.fn(),
  getSummary: vi.fn(),
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

vi.mock('../api', () => ({ api: apiMock }));

const portfolio: Portfolio = {
  id: 1,
  name: 'Sample portfolio',
  client_name: 'Sample client',
  base_currency: 'KES',
  created_at: '2026-11-20T00:00:00Z',
};

const firstTrade: Transaction = {
  id: 11,
  portfolio_id: 1,
  instrument: 'SCOM',
  type: 'BUY',
  quantity: '10',
  unit_price: '12',
  trade_date: '2026-11-20',
  created_at: '2026-11-20T09:00:00Z',
};

const secondTrade: Transaction = {
  ...firstTrade,
  id: 12,
  instrument: 'EQTY',
  type: 'BUY',
  trade_date: '2026-11-21',
  created_at: '2026-11-21T09:00:00Z',
};

const newTrade: Transaction = {
  ...firstTrade,
  id: 13,
  instrument: 'ABSA',
  trade_date: '2026-11-22',
  created_at: '2026-11-22T09:00:00Z',
};

const secondPortfolio: Portfolio = {
  ...portfolio,
  id: 2,
  name: 'Portfolio B',
  client_name: 'Client B',
};

const secondPortfolioTrade: Transaction = {
  ...secondTrade,
  id: 21,
  portfolio_id: 2,
  instrument: 'KCB',
};

const emptySummary: PortfolioSummary = {
  portfolio_id: 1,
  base_currency: 'KES',
  positions: [],
  total_invested: '0',
  total_value: '0',
};

let currentTransactions: Transaction[];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPortfolioPage() {
  return render(
    <MemoryRouter initialEntries={['/portfolios/1']}>
      <Routes>
        <Route path="/portfolios" element={<Link to="/portfolios/2">Open portfolio B</Link>} />
        <Route
          path="/portfolios/:id"
          element={(
            <>
              <Link to="/portfolios/2">Switch directly to portfolio B</Link>
              <PortfolioPage />
            </>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PortfolioPage long-name layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getPortfolio.mockImplementation(async (id: number) => id === 2 ? secondPortfolio : portfolio);
    apiMock.getTransactions.mockResolvedValue([]);
    apiMock.getSummary.mockResolvedValue(emptySummary);
  });

  it('keeps 100-character portfolio and client names intact and wrap-enabled', async () => {
    const longPortfolioName = 'P'.repeat(100);
    const longClientName = 'C'.repeat(100);
    apiMock.getPortfolio.mockResolvedValue({
      ...portfolio,
      name: longPortfolioName,
      client_name: longClientName,
    });
    renderPortfolioPage();

    const heading = await screen.findByRole('heading', { name: longPortfolioName });
    const headingContainer = heading.parentElement;
    const detailHeading = heading.closest('.detail-heading');
    const clientName = detailHeading?.querySelector('.eyebrow');

    expect(heading).toHaveTextContent(longPortfolioName);
    expect(heading).toHaveStyle({ overflowWrap: 'anywhere' });
    expect(headingContainer).not.toBeNull();
    expect(headingContainer).toHaveStyle({ width: 'min(100%, 760px)', minWidth: '0px' });
    expect(clientName).toHaveTextContent(longClientName);
    expect(clientName).toHaveStyle({ overflowWrap: 'anywhere' });
  });

  it('shows the calculated holdings panel before the trade-entry form', async () => {
    renderPortfolioPage();

    const holdingsPanel = await screen.findByRole('region', { name: 'Portfolio holdings' });
    const tradeEntryPanel = screen.getByRole('region', { name: 'Record a portfolio trade' });

    expect(holdingsPanel.parentElement?.firstElementChild).toBe(holdingsPanel);
    expect(holdingsPanel.compareDocumentPosition(tradeEntryPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('PortfolioPage trade mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTransactions = [firstTrade, secondTrade];
    apiMock.getPortfolio.mockImplementation(async (id: number) => id === 2 ? secondPortfolio : portfolio);
    apiMock.getTransactions.mockImplementation(async (id: number) => id === 2 ? [] : currentTransactions);
    apiMock.getSummary.mockImplementation(async (id: number) => ({ ...emptySummary, portfolio_id: id }));
    apiMock.createTransaction.mockImplementation(async () => {
      currentTransactions = [...currentTransactions, newTrade];
    });
    apiMock.deleteTransaction.mockImplementation(async (id: number) => {
      currentTransactions = currentTransactions.filter((trade) => trade.id !== id);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('preserves the trade and trigger focus when deletion is cancelled', async () => {
    const user = userEvent.setup();
    renderPortfolioPage();
    const deleteButton = await screen.findByRole('button', { name: 'Delete buy SCOM trade' });
    vi.mocked(window.confirm).mockReturnValue(false);

    await user.click(deleteButton);

    expect(screen.getByRole('table', { name: 'Transactions' })).toHaveTextContent('SCOM');
    expect(apiMock.deleteTransaction).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(deleteButton);
  });

  it('removes one trade and focuses the ledger heading when another trade remains', async () => {
    const user = userEvent.setup();
    renderPortfolioPage();
    const deleteButton = await screen.findByRole('button', { name: 'Delete buy SCOM trade' });
    const heading = screen.getByRole('heading', { name: 'Transactions' });

    await user.click(deleteButton);

    expect(await screen.findByRole('table', { name: 'Transactions' })).toHaveTextContent('EQTY');
    expect(screen.queryByText('SCOM')).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('keeps a stable non-body focus target when deleting the final trade', async () => {
    const user = userEvent.setup();
    currentTransactions = [firstTrade];
    renderPortfolioPage();
    const deleteButton = await screen.findByRole('button', { name: 'Delete buy SCOM trade' });
    const heading = screen.getByRole('heading', { name: 'Transactions' });

    await user.click(deleteButton);

    expect(await screen.findByRole('heading', { name: 'No trades recorded' })).toBeVisible();
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('does not let an older save refresh restore a trade deleted during that refresh', async () => {
    const user = userEvent.setup();
    const saveRefresh = deferred<Transaction[]>();
    const deleteRefresh = deferred<Transaction[]>();
    let transactionRead = 0;
    apiMock.getTransactions.mockImplementation(async (id: number) => {
      if (id === 2) return [];
      transactionRead += 1;
      if (transactionRead === 1) return [firstTrade, secondTrade];
      if (transactionRead === 2) return saveRefresh.promise;
      if (transactionRead === 3) return deleteRefresh.promise;
      throw new Error(`Unexpected transaction read ${transactionRead}`);
    });
    renderPortfolioPage();

    await user.type(await screen.findByLabelText('Instrument'), 'ABSA');
    await user.type(screen.getByLabelText('Quantity'), '1');
    await user.type(screen.getByLabelText('Unit price'), '12');
    await user.click(screen.getByRole('button', { name: 'Record Trade' }));
    await waitFor(() => expect(apiMock.getTransactions).toHaveBeenCalledTimes(2));
    const staleLedger = [...currentTransactions];

    await user.click(await screen.findByRole('button', { name: 'Delete buy SCOM trade' }));
    await waitFor(() => expect(apiMock.getTransactions).toHaveBeenCalledTimes(3));
    deleteRefresh.resolve([...currentTransactions]);
    await waitFor(() => expect(screen.getByRole('table', { name: 'Transactions' })).not.toHaveTextContent('SCOM'));

    saveRefresh.resolve(staleLedger);

    await screen.findByText('Trade recorded.');
    expect(screen.getByRole('table', { name: 'Transactions' })).not.toHaveTextContent('SCOM');
  });

  it('does not let a late delete on portfolio A move focus from portfolio B', async () => {
    const user = userEvent.setup();
    const deleteRequest = deferred<void>();
    apiMock.deleteTransaction.mockReturnValue(deleteRequest.promise);
    renderPortfolioPage();

    await user.click(await screen.findByRole('button', { name: 'Delete buy SCOM trade' }));
    await user.click(screen.getByRole('link', { name: /All portfolios/ }));
    await user.click(screen.getByRole('link', { name: 'Open portfolio B' }));
    const instrumentField = await screen.findByLabelText('Instrument');
    await user.click(instrumentField);
    expect(document.activeElement).toBe(instrumentField);

    deleteRequest.resolve();

    vi.useFakeTimers();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    vi.useRealTimers();
    expect(document.activeElement).toBe(instrumentField);
  });

  it('does not publish a save notice from portfolio A after switching to portfolio B', async () => {
    const user = userEvent.setup();
    const saveRequest = deferred<Transaction>();
    apiMock.createTransaction.mockReturnValue(saveRequest.promise);
    renderPortfolioPage();

    await user.type(await screen.findByLabelText('Instrument'), 'ABSA');
    await user.type(screen.getByLabelText('Quantity'), '1');
    await user.type(screen.getByLabelText('Unit price'), '12');
    await user.click(screen.getByRole('button', { name: 'Record Trade' }));
    await waitFor(() => expect(apiMock.createTransaction).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('link', { name: 'Switch directly to portfolio B' }));
    await screen.findByRole('heading', { name: 'Portfolio B' });
    const portfolioBInstrument = screen.getByLabelText('Instrument');
    expect(portfolioBInstrument).toHaveValue('');
    expect(portfolioBInstrument).not.toBeDisabled();

    await act(async () => {
      saveRequest.resolve(newTrade);
      await saveRequest.promise;
    });

    expect(screen.queryByText('Trade saved to the portfolio ledger.')).not.toBeInTheDocument();
    expect(screen.queryByText('Trade recorded.')).not.toBeInTheDocument();
  });

  it('resets portfolio A pending state when the detail route is reused for portfolio B', async () => {
    const user = userEvent.setup();
    const portfolioARefresh = deferred<Transaction[]>();
    let portfolioARead = 0;
    apiMock.getTransactions.mockImplementation(async (id: number) => {
      if (id === 2) return [secondPortfolioTrade];
      portfolioARead += 1;
      if (portfolioARead === 1) return [firstTrade, secondTrade];
      if (portfolioARead === 2) return portfolioARefresh.promise;
      throw new Error(`Unexpected portfolio A read ${portfolioARead}`);
    });
    renderPortfolioPage();

    await user.click(await screen.findByRole('button', { name: 'Delete buy SCOM trade' }));
    expect(await screen.findByText('Refreshing portfolio data…')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Switch directly to portfolio B' }));

    const instrumentField = await screen.findByLabelText('Instrument');
    const portfolioBDeleteButton = await screen.findByRole('button', { name: 'Delete buy KCB trade' });
    expect(screen.queryByText('Refreshing portfolio data…')).not.toBeInTheDocument();
    expect(portfolioBDeleteButton).not.toBeDisabled();
    await user.click(instrumentField);

    portfolioARefresh.resolve([firstTrade, secondTrade]);
    vi.useFakeTimers();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    vi.useRealTimers();

    expect(screen.getByRole('heading', { name: 'Portfolio B' })).toBeInTheDocument();
    expect(document.activeElement).toBe(instrumentField);
    expect(screen.queryByText('Refreshing portfolio data…')).not.toBeInTheDocument();
    expect(portfolioBDeleteButton).not.toBeDisabled();
  });

  it('does not claim holdings and totals refreshed when the post-delete refresh fails', async () => {
    const user = userEvent.setup();
    apiMock.getSummary
      .mockResolvedValueOnce(emptySummary)
      .mockRejectedValueOnce(new Error('Service unavailable'));
    renderPortfolioPage();

    await user.click(await screen.findByRole('button', { name: 'Delete buy SCOM trade' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Saved data could not be refreshed: Service unavailable');
    expect(screen.queryByText(/holdings and totals were refreshed/i)).not.toBeInTheDocument();
    expect(screen.getByText('Trade deleted from the portfolio ledger.')).toHaveAttribute('role', 'status');
  });
});
