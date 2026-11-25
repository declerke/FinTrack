import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Portfolio, PortfolioSummary, Transaction } from '../types';
import { formatDate } from '../format';
import { HoldingsPanel } from '../components/HoldingsPanel';
import { TradeForm, type NewTrade } from '../components/TradeForm';
import { TransactionsTable } from '../components/TransactionsTable';

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'FinTrack could not complete this request. Check your connection and try again.';
}

interface PortfolioData {
  portfolio: Portfolio;
  transactions: Transaction[];
  summary: PortfolioSummary;
}

async function fetchPortfolioData(portfolioId: number): Promise<PortfolioData> {
  const [portfolio, transactions, summary] = await Promise.all([
    api.getPortfolio(portfolioId),
    api.getTransactions(portfolioId),
    api.getSummary(portfolioId),
  ]);
  return { portfolio, transactions, summary };
}

export function PortfolioPage() {
  const { id: routeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const portfolioId = Number(routeId);
  const isValidPortfolioId = Number.isSafeInteger(portfolioId) && portfolioId >= 1;
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadErrorForId, setLoadErrorForId] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const latestLoadId = useRef(0);
  const activeView = useRef<{ portfolioId: number; locationKey: string } | null>(null);

  useLayoutEffect(() => {
    const view = isValidPortfolioId ? { portfolioId, locationKey: location.key } : null;
    activeView.current = view;
    return () => {
      if (activeView.current?.locationKey === location.key) activeView.current = null;
    };
  }, [isValidPortfolioId, location.key, portfolioId]);

  const loadPortfolio = useCallback(async (showPageLoader: boolean) => {
    const locationKey = location.key;
    const isStillActiveView = () => (
      activeView.current?.portfolioId === portfolioId
      && activeView.current.locationKey === locationKey
    );
    if (!isStillActiveView()) return;

    const loadId = ++latestLoadId.current;
    if (showPageLoader) {
      setIsLoading(true);
      setIsRefreshing(false);
      setPendingDeleteId(null);
      setActionError('');
      setNotice('');
    } else setIsRefreshing(true);
    setLoadError('');
    setLoadErrorForId(null);
    setRefreshError('');
    try {
      const { portfolio, transactions, summary } = await fetchPortfolioData(portfolioId);
      if (loadId !== latestLoadId.current || !isStillActiveView()) return;
      setPortfolio(portfolio);
      setTransactions(transactions);
      setSummary(summary);
    } catch (error) {
      if (loadId !== latestLoadId.current || !isStillActiveView()) return;
      if (showPageLoader) {
        setLoadError(errorText(error));
        setLoadErrorForId(portfolioId);
      } else setRefreshError(errorText(error));
    } finally {
      if (loadId === latestLoadId.current && isStillActiveView()) {
        if (showPageLoader) setIsLoading(false);
        else setIsRefreshing(false);
      }
    }
  }, [location.key, portfolioId]);

  const isCurrentPortfolio = portfolio?.id === portfolioId;

  useEffect(() => {
    if (!isValidPortfolioId) return;
    const locationKey = location.key;
    const loadId = ++latestLoadId.current;
    let isCurrentRequest = true;

    void fetchPortfolioData(portfolioId)
      .then(({ portfolio: nextPortfolio, transactions: nextTransactions, summary: nextSummary }) => {
        const view = activeView.current;
        if (
          !isCurrentRequest
          || loadId !== latestLoadId.current
          || view?.portfolioId !== portfolioId
          || view.locationKey !== locationKey
        ) return;
        setPortfolio(nextPortfolio);
        setTransactions(nextTransactions);
        setSummary(nextSummary);
        setLoadError('');
        setLoadErrorForId(null);
        setRefreshError('');
        setActionError('');
        setNotice('');
      })
      .catch((error: unknown) => {
        const view = activeView.current;
        if (
          !isCurrentRequest
          || loadId !== latestLoadId.current
          || view?.portfolioId !== portfolioId
          || view.locationKey !== locationKey
        ) return;
        setLoadError(errorText(error));
        setLoadErrorForId(portfolioId);
      })
      .finally(() => {
        const view = activeView.current;
        if (
          isCurrentRequest
          && loadId === latestLoadId.current
          && view?.portfolioId === portfolioId
          && view.locationKey === locationKey
        ) {
          setIsLoading(false);
          setIsRefreshing(false);
          setPendingDeleteId(null);
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [isValidPortfolioId, location.key, portfolioId]);

  useEffect(() => {
    document.title = isCurrentPortfolio && portfolio
      ? `${portfolio.name} · FinTrack by Finnet Technologies`
      : 'Portfolio · FinTrack by Finnet Technologies';
  }, [isCurrentPortfolio, portfolio]);

  async function saveTrade(trade: NewTrade) {
    const saveViewKey = location.key;
    setActionError('');
    setNotice('');
    await api.createTransaction(portfolioId, trade);
    if (
      activeView.current?.portfolioId !== portfolioId
      || activeView.current.locationKey !== saveViewKey
    ) return;
    setNotice('Trade saved to the portfolio ledger.');
    await loadPortfolio(false);
  }

  async function deleteTrade(trade: Transaction) {
    const deleteViewKey = location.key;
    const isStillDeleteView = () => (
      activeView.current?.portfolioId === portfolioId
      && activeView.current.locationKey === deleteViewKey
    );
    const type = trade.type === 'BUY' ? 'buy' : 'sell';
    if (!window.confirm(`Delete this ${type} of ${trade.quantity} ${trade.instrument}? Later trades will be checked against the updated ledger.`)) return;
    setPendingDeleteId(trade.id);
    setActionError('');
    setNotice('');
    try {
      await api.deleteTransaction(trade.id);
      if (!isStillDeleteView()) return;
      setNotice('Trade deleted from the portfolio ledger.');
      await loadPortfolio(false);
      if (!isStillDeleteView()) return;
      window.requestAnimationFrame(() => {
        if (isStillDeleteView()) document.getElementById('transactions-heading')?.focus();
      });
    } catch (error) {
      if (isStillDeleteView()) setActionError(errorText(error));
    } finally {
      if (isStillDeleteView()) setPendingDeleteId(null);
    }
  }

  if (!isValidPortfolioId) {
    return (
      <main id="main-content" className="page-content">
        <Link className="back-link" to="/portfolios">← Back to portfolios</Link>
        <div className="message-panel message-panel-error" role="alert">
          <h1>Portfolio address is not valid</h1>
          <p>Return to the portfolio list and choose a portfolio.</p>
          <Link className="button button-secondary" to="/portfolios">Return to portfolios</Link>
        </div>
      </main>
    );
  }

  if (!isCurrentPortfolio && loadErrorForId !== portfolioId) {
    return (
      <main id="main-content" className="page-content" aria-busy="true" aria-live="polite">
        <div className="loading-heading"><span className="skeleton-line skeleton-short" /><span className="skeleton-line skeleton-long" /></div>
        <div className="detail-skeleton"><span /><span /><span /></div>
        <p className="visually-hidden">Loading portfolio, holdings and transactions…</p>
      </main>
    );
  }

  if (loadErrorForId === portfolioId || !isCurrentPortfolio || !portfolio || !summary) {
    return (
      <main id="main-content" className="page-content">
        <Link className="back-link" to="/portfolios">← Back to portfolios</Link>
        <div className="message-panel message-panel-error" role="alert">
          <h1>Portfolio could not be loaded</h1>
          <p>{loadErrorForId === portfolioId && loadError ? loadError : 'The portfolio data is incomplete. Try loading it again.'}</p>
          <div className="form-actions">
            <button type="button" className="button button-secondary" onClick={() => void loadPortfolio(true)} disabled={isLoading}>Try again</button>
            <Link className="button button-quiet" to="/portfolios">Return to portfolios</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="page-content detail-page">
      <Link className="back-link" to="/portfolios">← All portfolios</Link>
      <div className="page-heading detail-heading">
        <div>
          <p className="eyebrow">{portfolio.client_name} · Created {formatDate(portfolio.created_at)}</p>
          <h1>{portfolio.name}</h1>
          <p className="page-lede">Trade history and open positions, in {portfolio.base_currency}.</p>
        </div>
        <span className="currency-tag currency-tag-large">{portfolio.base_currency}</span>
      </div>

      {notice ? <p className="form-message form-message-success page-message" role="status" aria-live="polite">{notice}</p> : null}
      {actionError ? <p className="form-message form-message-error page-message" role="alert">{actionError}</p> : null}
      {refreshError ? (
        <div className="message-panel message-panel-error refresh-message" role="alert">
          <p>Saved data could not be refreshed: {refreshError}</p>
          <button type="button" className="button button-secondary button-small" onClick={() => void loadPortfolio(false)} disabled={isRefreshing}>Retry refresh</button>
        </div>
      ) : null}
      {isRefreshing ? <p className="refresh-indicator" role="status" aria-live="polite">Refreshing portfolio data…</p> : null}

      <div className="detail-grid">
        <div className="detail-primary">
          <section className="panel holdings-container" aria-label="Portfolio holdings">
            <HoldingsPanel summary={summary} currency={portfolio.base_currency} />
          </section>
          <section className="panel trade-entry-panel" aria-label="Record a portfolio trade">
            <TradeForm currency={portfolio.base_currency} onSubmit={saveTrade} />
          </section>
        </div>
        <section className="panel transaction-container" aria-label="Portfolio transaction history">
          <TransactionsTable
            transactions={transactions}
            currency={portfolio.base_currency}
            pendingId={pendingDeleteId}
            onDelete={(trade) => { void deleteTrade(trade); }}
          />
        </section>
      </div>
      <button className="visually-hidden" type="button" onClick={() => navigate('/portfolios')}>Back to portfolios</button>
    </main>
  );
}
