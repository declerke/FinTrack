import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TransactionsTable } from './TransactionsTable';

const transactions = [
  { id: 1, portfolio_id: 2, instrument: 'SCOM', type: 'BUY' as const, quantity: '10', unit_price: '12', trade_date: '2026-11-20', created_at: '2026-11-20T09:00:00Z' },
  { id: 2, portfolio_id: 2, instrument: 'EQTY', type: 'SELL' as const, quantity: '2', unit_price: '80', trade_date: '2026-11-22', created_at: '2026-11-22T09:00:00Z' },
  { id: 3, portfolio_id: 2, instrument: 'SCOM', type: 'SELL' as const, quantity: '4', unit_price: '15', trade_date: '2026-11-23', created_at: '2026-11-23T09:00:00Z' },
];

describe('TransactionsTable', () => {
  it('filters by symbol and type, then distinguishes no matches', async () => {
    const user = userEvent.setup();
    render(<TransactionsTable transactions={transactions} currency="KES" onDelete={vi.fn()} pendingId={null} />);

    await user.type(screen.getByRole('searchbox', { name: 'Filter by symbol' }), 'scom');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by trade type' }), 'SELL');
    const table = screen.getByRole('table', { name: 'Transactions' });
    const body = within(table).getAllByRole('rowgroup')[1];
    expect(within(body).getAllByRole('row')).toHaveLength(1);
    expect(within(body).getByText('SCOM')).toBeVisible();
    expect(within(body).getByText('Sell')).toBeVisible();

    await user.type(screen.getByRole('searchbox', { name: 'Filter by symbol' }), 'x');
    expect(screen.getByText('No trades match these filters.')).toBeVisible();
  });

  it('renders large decimal trade values without losing precision', () => {
    const highValueTrade = {
      ...transactions[0],
      quantity: '1000000030.617285',
      unit_price: '99999.617284',
    };
    render(<TransactionsTable transactions={[highValueTrade]} currency="KES" onDelete={vi.fn()} pendingId={null} />);
    expect(screen.getByText(/99,999,620,345,716\.78/)).toBeVisible();
  });

  it('sorts maximum-sized decimal trade values exactly', async () => {
    const user = userEvent.setup();
    const highTrade = {
      ...transactions[0],
      id: 4,
      instrument: 'HIGH',
      quantity: '999999999999.999999',
      unit_price: '999999999999.999999',
      trade_date: '2026-01-01',
    };
    const lowTrade = {
      ...transactions[0],
      id: 5,
      instrument: 'LOW',
      quantity: '999999999999.999999',
      unit_price: '999999999999.999998',
      trade_date: '2026-01-02',
    };
    render(<TransactionsTable transactions={[highTrade, lowTrade]} currency="KES" onDelete={vi.fn()} pendingId={null} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort transactions' }), 'amount');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort order' }), 'ascending');
    const body = within(screen.getByRole('table', { name: 'Transactions' })).getAllByRole('rowgroup')[1];
    const symbols = within(body).getAllByRole('row').map((row) => within(row).getByText(/HIGH|LOW/).textContent);
    expect(symbols).toEqual(['LOW', 'HIGH']);
  });

  it('sorts transaction rows by numeric amount rather than string order', async () => {
    const user = userEvent.setup();
    render(<TransactionsTable transactions={transactions} currency="KES" onDelete={vi.fn()} pendingId={null} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort transactions' }), 'amount');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort order' }), 'ascending');

    const table = screen.getByRole('table', { name: 'Transactions' });
    const body = within(table).getAllByRole('rowgroup')[1];
    const symbols = within(body).getAllByRole('row').map((row) => within(row).getByText(/SCOM|EQTY/).textContent);
    expect(symbols).toEqual(['SCOM', 'SCOM', 'EQTY']);
  });
});
