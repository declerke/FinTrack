import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../styles.css';
import type { Portfolio, PortfolioSummary, Transaction } from '../types';
import { PortfolioPage } from './PortfolioPage';

const apiMock = vi.hoisted(() => ({
  getPortfolio: vi.fn(),
  getTransactions: vi.fn(),
  getSummary: vi.fn(),
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

const emptySummary: PortfolioSummary = {
  portfolio_id: 1,
  base_currency: 'KES',
  positions: [],
  total_invested: '0',
  total_value: '0',
};

let currentTransactions: Transaction[];

function renderPortfolioPage() {
  return render(
    <MemoryRouter initialEntries={['/portfolios/1']}>
      <Routes>
        <Route path="/portfolios/:id" element={<PortfolioPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PortfolioPage long-name layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getPortfolio.mockResolvedValue(portfolio);
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
});

describe('PortfolioPage trade deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTransactions = [firstTrade, secondTrade];
    apiMock.getPortfolio.mockResolvedValue(portfolio);
    apiMock.getTransactions.mockImplementation(async () => currentTransactions);
    apiMock.getSummary.mockResolvedValue(emptySummary);
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
});
