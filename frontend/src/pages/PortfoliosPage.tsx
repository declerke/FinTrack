import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Portfolio, PortfolioInput } from '../types';
import { formatDate } from '../format';

const emptyForm: PortfolioInput = { name: '', client_name: '', base_currency: 'KES' };

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'FinTrack could not complete this request. Check your connection and try again.';
}

export function PortfoliosPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [form, setForm] = useState<PortfolioInput>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<number | 'save' | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);

  const loadPortfolios = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      setPortfolios(await api.getPortfolios());
    } catch (error) {
      setLoadError(errorText(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    document.title = 'Portfolios · FinTrack by Finnet Technologies';
    api.getPortfolios()
      .then((loadedPortfolios) => {
        if (isCurrent) setPortfolios(loadedPortfolios);
      })
      .catch((error: unknown) => {
        if (isCurrent) setLoadError(errorText(error));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, []);

  function updateForm(field: keyof PortfolioInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setActionError('');
    setNotice('');
  }

  function startEditing(portfolio: Portfolio) {
    setEditingId(portfolio.id);
    setForm({ name: portfolio.name, client_name: portfolio.client_name, base_currency: portfolio.base_currency });
    setActionError('');
    setNotice('');
    window.requestAnimationFrame(() => nameInput.current?.focus());
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(emptyForm);
    setActionError('');
    setNotice('Edit cancelled. Portfolio data was not changed.');
  }

  async function submitPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError('');
    setNotice('');
    setPendingAction('save');
    const input = { ...form, name: form.name.trim(), client_name: form.client_name.trim() };
    try {
      if (editingId === null) {
        await api.createPortfolio(input);
        setNotice('Portfolio created.');
      } else {
        await api.updatePortfolio(editingId, input);
        setNotice('Portfolio updated.');
      }
      setEditingId(null);
      setForm(emptyForm);
      await loadPortfolios();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function deletePortfolio(portfolio: Portfolio) {
    const approved = window.confirm(`Delete “${portfolio.name}”? Its trades and holdings will also be removed.`);
    if (!approved) return;
    setPendingAction(portfolio.id);
    setActionError('');
    setNotice('');
    try {
      await api.deletePortfolio(portfolio.id);
      setNotice(`${portfolio.name} deleted.`);
      await loadPortfolios();
      window.requestAnimationFrame(() => listHeading.current?.focus());
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main id="main-content" className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Client accounts</p>
          <h1>Portfolios</h1>
          <p className="page-lede">Review client portfolios and open a ledger to see its holdings and trade history.</p>
        </div>
        <span className="page-count">{portfolios.length} {portfolios.length === 1 ? 'portfolio' : 'portfolios'}</span>
      </div>

      {notice ? <p className="form-message form-message-success page-message" role="status" aria-live="polite">{notice}</p> : null}
      {actionError ? <p className="form-message form-message-error page-message" role="alert">{actionError}</p> : null}

      <div className="portfolio-workspace">
        <section className="panel portfolio-editor" aria-labelledby="portfolio-editor-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Portfolio setup</p>
              <h2 id="portfolio-editor-heading">{editingId === null ? 'Create portfolio' : 'Edit portfolio'}</h2>
            </div>
          </div>
          <form className="stacked-form" onSubmit={submitPortfolio}>
            <div className="field-group">
              <label htmlFor="portfolio-name">Portfolio name</label>
              <input ref={nameInput} id="portfolio-name" name="name" required maxLength={100} value={form.name} onChange={(event) => updateForm('name', event.currentTarget.value)} disabled={pendingAction === 'save'} />
            </div>
            <div className="field-group">
              <label htmlFor="client-name">Client name</label>
              <input id="client-name" name="client_name" required maxLength={100} value={form.client_name} onChange={(event) => updateForm('client_name', event.currentTarget.value)} disabled={pendingAction === 'save'} />
            </div>
            <div className="field-group">
              <label htmlFor="base-currency">Base currency</label>
              <select id="base-currency" name="base_currency" value={form.base_currency} onChange={(event) => updateForm('base_currency', event.currentTarget.value)} disabled={pendingAction === 'save'}>
                <option value="KES">KES — Kenyan shilling</option>
                <option value="USD">USD — US dollar</option>
              </select>
              {editingId !== null ? <p className="field-hint">A portfolio currency cannot change after its first trade.</p> : null}
            </div>
            <div className="form-actions">
              <button className="button button-primary" type="submit" disabled={pendingAction === 'save'} aria-busy={pendingAction === 'save'}>
                {pendingAction === 'save' ? 'Saving…' : editingId === null ? 'Create portfolio' : 'Save changes'}
              </button>
              {editingId !== null ? <button className="button button-quiet" type="button" onClick={cancelEditing} disabled={pendingAction !== null}>Cancel edit</button> : null}
            </div>
          </form>
        </section>

        <section className="portfolio-list-section" aria-labelledby="portfolio-list-heading">
          <div className="section-heading portfolio-list-heading">
            <div>
              <p className="eyebrow">Your workspace</p>
              <h2 id="portfolio-list-heading" ref={listHeading} tabIndex={-1}>Client portfolios</h2>
            </div>
            {isLoading ? <span className="muted-text" role="status" aria-live="polite">Loading portfolios…</span> : null}
          </div>

          {loadError ? (
            <div className="message-panel message-panel-error" role="alert">
              <h3>Portfolios could not be loaded</h3>
              <p>{loadError}</p>
              <button type="button" className="button button-secondary" onClick={() => void loadPortfolios()}>Try again</button>
            </div>
          ) : null}

          {!loadError && isLoading ? (
            <div className="portfolio-skeleton" aria-hidden="true"><span /><span /></div>
          ) : null}

          {!loadError && !isLoading && portfolios.length === 0 ? (
            <div className="empty-state portfolio-empty">
              <span className="empty-mark" aria-hidden="true">+</span>
              <h3>Your workspace is ready</h3>
              <p>Create a portfolio for a client, then record trades to see its holdings.</p>
            </div>
          ) : null}

          {!loadError && !isLoading && portfolios.length > 0 ? (
            <ul className="portfolio-list">
              {portfolios.map((portfolio) => (
                <li className="portfolio-item" key={portfolio.id}>
                  <div className="portfolio-item-copy">
                    <div className="portfolio-item-title">
                      <Link className="portfolio-name-link" to={`/portfolios/${portfolio.id}`}>{portfolio.name}</Link>
                      <span className="currency-tag">{portfolio.base_currency}</span>
                    </div>
                    <p>{portfolio.client_name}</p>
                    <span className="portfolio-date">Created {formatDate(portfolio.created_at)}</span>
                  </div>
                  <div className="portfolio-item-actions">
                    <Link className="button button-secondary button-small" to={`/portfolios/${portfolio.id}`}>Open portfolio</Link>
                    <button className="button button-quiet button-small" type="button" onClick={() => startEditing(portfolio)} disabled={pendingAction !== null} aria-label={`Edit ${portfolio.name}`}>Edit</button>
                    <button className="button button-quiet button-small danger-action" type="button" onClick={() => void deletePortfolio(portfolio)} disabled={pendingAction !== null} aria-busy={pendingAction === portfolio.id} aria-label={`Delete ${portfolio.name}`}>
                      {pendingAction === portfolio.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}
