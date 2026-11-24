import { useMemo, useState } from 'react';
import type { Transaction } from '../types';
import { formatCurrency, formatDate, formatQuantity } from '../format';

interface TransactionsTableProps {
  transactions: Transaction[];
  currency: string;
  pendingId: number | null;
  onDelete: (transaction: Transaction) => void;
}

type SortField = 'date' | 'amount';
type SortDirection = 'ascending' | 'descending';

function grossAmount(transaction: Transaction): number {
  return Number(transaction.quantity) * Number(transaction.unit_price);
}

export function TransactionsTable({ transactions, currency, pendingId, onDelete }: TransactionsTableProps) {
  const [symbolFilter, setSymbolFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending');

  const visibleTransactions = useMemo(() => {
    const needle = symbolFilter.trim().toUpperCase();
    return transactions
      .filter((trade) => trade.instrument.toUpperCase().includes(needle))
      .filter((trade) => typeFilter === 'ALL' || trade.type === typeFilter)
      .slice()
      .sort((left, right) => {
        const order = sortField === 'date'
          ? left.trade_date.localeCompare(right.trade_date)
            || left.created_at.localeCompare(right.created_at)
            || left.id - right.id
          : grossAmount(left) - grossAmount(right)
            || left.trade_date.localeCompare(right.trade_date)
            || left.id - right.id;
        return sortDirection === 'ascending' ? order : -order;
      });
  }, [transactions, symbolFilter, typeFilter, sortField, sortDirection]);

  if (transactions.length === 0) {
    return (
      <div className="empty-state compact-empty">
        <span className="empty-mark" aria-hidden="true">+</span>
        <h3>No trades recorded</h3>
        <p>Add a buy or sell to start the ledger. Your holdings update from the saved transactions.</p>
      </div>
    );
  }

  return (
    <section className="transactions-panel" aria-labelledby="transactions-heading">
      <div className="section-heading table-heading">
        <div>
          <p className="eyebrow">Portfolio activity</p>
          <h2 id="transactions-heading" tabIndex={-1}>Transactions</h2>
        </div>
        <span className="result-count">{visibleTransactions.length} of {transactions.length} trades</span>
      </div>

      <div className="table-controls">
        <div className="field-group filter-field">
          <label htmlFor="symbol-filter">Filter by symbol</label>
          <input
            id="symbol-filter"
            type="search"
            value={symbolFilter}
            onChange={(event) => setSymbolFilter(event.currentTarget.value)}
            placeholder="Search symbols"
            autoComplete="off"
          />
        </div>
        <div className="field-group compact-field">
          <label htmlFor="type-filter">Filter by trade type</label>
          <select id="type-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.currentTarget.value as typeof typeFilter)}>
            <option value="ALL">All types</option>
            <option value="BUY">Buys</option>
            <option value="SELL">Sells</option>
          </select>
        </div>
        <div className="field-group compact-field">
          <label htmlFor="transaction-sort">Sort transactions</label>
          <select id="transaction-sort" value={sortField} onChange={(event) => setSortField(event.currentTarget.value as SortField)}>
            <option value="date">Trade date</option>
            <option value="amount">Numeric amount</option>
          </select>
        </div>
        <div className="field-group compact-field">
          <label htmlFor="transaction-order">Sort order</label>
          <select id="transaction-order" value={sortDirection} onChange={(event) => setSortDirection(event.currentTarget.value as SortDirection)}>
            <option value="descending">Newest / highest first</option>
            <option value="ascending">Oldest / lowest first</option>
          </select>
        </div>
      </div>

      {visibleTransactions.length === 0 ? (
        <div className="empty-state compact-empty no-match" role="status">
          <h3>No trades match these filters.</h3>
          <p>Clear the symbol search or choose all trade types to see the full ledger.</p>
        </div>
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Transactions table. Scroll horizontally to see all columns.">
          <table aria-labelledby="transactions-heading" className="data-table transactions-table">
            <thead>
              <tr>
                <th scope="col">Trade date</th>
                <th scope="col">Symbol</th>
                <th scope="col">Type</th>
                <th scope="col" className="numeric-cell">Quantity</th>
                <th scope="col" className="numeric-cell">Unit price</th>
                <th scope="col" className="numeric-cell">Trade value</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((trade) => (
                <tr key={trade.id}>
                  <td>{formatDate(trade.trade_date)}</td>
                  <td><span className="instrument-chip">{trade.instrument}</span></td>
                  <td><span className={`trade-badge trade-badge-${trade.type.toLowerCase()}`}>{trade.type === 'BUY' ? 'Buy' : 'Sell'}</span></td>
                  <td className="numeric-cell">{formatQuantity(trade.quantity)}</td>
                  <td className="numeric-cell">{formatCurrency(trade.unit_price, currency)}</td>
                  <td className="numeric-cell">{formatCurrency(grossAmount(trade), currency)}</td>
                  <td className="action-cell">
                    <button
                      className="button button-quiet button-small"
                      type="button"
                      disabled={pendingId !== null}
                      aria-busy={pendingId === trade.id}
                      aria-label={`Delete ${trade.type.toLowerCase()} ${trade.instrument} trade`}
                      onClick={() => onDelete(trade)}
                    >
                      {pendingId === trade.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
