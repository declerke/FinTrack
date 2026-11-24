import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PortfolioSummary } from '../types';
import { HoldingsPanel } from './HoldingsPanel';

const allocationSummary: PortfolioSummary & {
  positions: (PortfolioSummary['positions'][number] & { allocation_percentage: number })[];
} = {
  portfolio_id: 1,
  base_currency: 'KES',
  total_invested: '0.02',
  total_value: '0.01',
  positions: [
    {
      instrument: 'SCOM',
      net_quantity: '1',
      average_cost: '0.01',
      total_invested: '0.01',
      valuation_price: '0.01',
      total_value: '0.01',
      allocation_percentage: 50,
    },
    {
      instrument: 'EQTY',
      net_quantity: '1',
      average_cost: '0.01',
      total_invested: '0.01',
      valuation_price: '0.01',
      total_value: '0.01',
      allocation_percentage: 50,
    },
  ],
};

describe('HoldingsPanel', () => {
  it('renders server allocation shares for meter width, accessible value and label', () => {
    const { rerender } = render(<HoldingsPanel summary={allocationSummary} currency="KES" />);

    expect(screen.getAllByText('50.0%')).toHaveLength(2);
    for (const instrument of ['SCOM', 'EQTY']) {
      const meter = screen.getByRole('meter', { name: `${instrument} allocation` });
      expect(meter).toHaveAttribute('aria-valuenow', '50');
      expect(meter).toHaveAttribute('aria-valuetext', expect.stringContaining('50.0 percent'));
      expect(meter.firstElementChild).toHaveStyle({ width: '50%' });
    }

    rerender(
      <HoldingsPanel
        summary={{
          ...allocationSummary,
          positions: allocationSummary.positions.map((position, index) => ({
            ...position,
            allocation_percentage: index === 0 ? 25 : 75,
          })),
        }}
        currency="KES"
      />,
    );

    expect(screen.getByText('25.0%')).toBeVisible();
    expect(screen.getByText('75.0%')).toBeVisible();
    expect(screen.getByRole('meter', { name: 'SCOM allocation' }).firstElementChild).toHaveStyle({ width: '25%' });
    expect(screen.getByRole('meter', { name: 'EQTY allocation' }).firstElementChild).toHaveStyle({ width: '75%' });
  });

  it('explains how to add holdings when the portfolio is empty', () => {
    render(
      <HoldingsPanel
        summary={{ ...allocationSummary, positions: [], total_invested: '0', total_value: '0' }}
        currency="KES"
      />,
    );

    expect(screen.getByRole('heading', { name: 'No open holdings' })).toBeVisible();
    expect(screen.getByText('Record a buy trade to add the first instrument to this portfolio.')).toBeVisible();
  });
});
