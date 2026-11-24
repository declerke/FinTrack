import type { PortfolioSummary, PositionSummary } from '../types';
import { formatCurrency, formatQuantity } from '../format';

interface HoldingsPanelProps {
  summary: PortfolioSummary;
  currency: string;
}

function allocationPercent(position: PositionSummary, summary: PortfolioSummary): number {
  const total = Number(summary.total_value);
  const value = Number(position.total_value);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

export function HoldingsPanel({ summary, currency }: HoldingsPanelProps) {
  return (
    <section className="holdings-panel" aria-labelledby="holdings-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Server calculated</p>
          <h2 id="holdings-heading">Holdings</h2>
        </div>
        <span className="currency-tag">{currency}</span>
      </div>

      <div className="summary-metrics">
        <div className="summary-metric">
          <span>Remaining cost basis</span>
          <strong>{formatCurrency(summary.total_invested, currency)}</strong>
        </div>
        <div className="summary-metric summary-metric-value">
          <span>Estimated value</span>
          <strong>{formatCurrency(summary.total_value, currency)}</strong>
        </div>
      </div>
      <p className="accounting-note">
        Cost uses moving weighted-average acquisition cost. Estimated value uses each instrument’s latest recorded trade price; market prices, fees, taxes and FX are excluded.
      </p>

      {summary.positions.length === 0 ? (
        <div className="empty-state compact-empty holdings-empty">
          <h3>No open holdings</h3>
          <p>Record a buy trade to add the first instrument to this portfolio.</p>
        </div>
      ) : (
        <>
          <figure className="allocation-figure" aria-labelledby="allocation-heading">
            <figcaption id="allocation-heading">
              <span>Value allocation</span>
              <span className="muted-text">Share of estimated value</span>
            </figcaption>
            <div className="allocation-list">
              {summary.positions.map((position) => {
                const percent = allocationPercent(position, summary);
                return (
                  <div className="allocation-row" key={position.instrument}>
                    <span className="allocation-symbol">{position.instrument}</span>
                    <div
                      className="allocation-meter"
                      role="meter"
                      aria-label={`${position.instrument} allocation`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Number(percent.toFixed(1))}
                      aria-valuetext={`${percent.toFixed(1)} percent, ${formatCurrency(position.total_value, currency)}`}
                    >
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <span className="allocation-percent">{percent.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </figure>

          <div className="table-scroll holdings-table-scroll" tabIndex={0} role="region" aria-label="Holdings table. Scroll horizontally to see all columns.">
            <table className="data-table holdings-table">
              <caption className="visually-hidden">Open holdings and server calculated values in {currency}</caption>
              <thead>
                <tr>
                  <th scope="col">Instrument</th>
                  <th scope="col" className="numeric-cell">Net quantity</th>
                  <th scope="col" className="numeric-cell">Average cost</th>
                  <th scope="col" className="numeric-cell">Cost basis</th>
                  <th scope="col" className="numeric-cell">Latest price</th>
                  <th scope="col" className="numeric-cell">Estimated value</th>
                </tr>
              </thead>
              <tbody>
                {summary.positions.map((position) => (
                  <tr key={position.instrument}>
                    <th scope="row">{position.instrument}</th>
                    <td className="numeric-cell">{formatQuantity(position.net_quantity)}</td>
                    <td className="numeric-cell">{formatCurrency(position.average_cost, currency)}</td>
                    <td className="numeric-cell">{formatCurrency(position.total_invested, currency)}</td>
                    <td className="numeric-cell">{formatCurrency(position.valuation_price, currency)}</td>
                    <td className="numeric-cell value-cell">{formatCurrency(position.total_value, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
