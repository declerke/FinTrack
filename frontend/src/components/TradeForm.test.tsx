import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as tradeFormModule from './TradeForm';
import type { NewTrade } from './TradeForm';

const TradeForm = tradeFormModule.TradeForm;

function renderTradeForm(onSubmit: (trade: NewTrade) => Promise<void>) {
  expect(TradeForm).toBeDefined();
  return render(<TradeForm currency="KES" onSubmit={onSubmit} />);
}

async function fillValidTrade(user: ReturnType<typeof userEvent.setup>, quantity = '100') {
  await user.type(screen.getByRole('textbox', { name: 'Instrument' }), 'SCOM');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Trade type' }), 'BUY');
  await user.type(screen.getByRole('spinbutton', { name: 'Quantity' }), quantity);
  await user.type(screen.getByRole('spinbutton', { name: 'Unit price' }), '100');
  fireEvent.change(screen.getByLabelText('Trade date'), { target: { value: '2026-11-24' } });
}

describe('TradeForm', () => {
  it('rejects a non-positive quantity before calling the API', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderTradeForm(onSubmit);

    await user.type(screen.getByRole('textbox', { name: 'Instrument' }), 'SCOM');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Trade type' }), 'BUY');
    await user.type(screen.getByRole('spinbutton', { name: 'Quantity' }), '0');
    await user.type(screen.getByRole('spinbutton', { name: 'Unit price' }), '100');
    fireEvent.change(screen.getByLabelText('Trade date'), { target: { value: '2026-11-24' } });
    await user.click(screen.getByRole('button', { name: 'Record Trade' }));

    expect(await screen.findByText('Enter a quantity greater than zero.')).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables repeat submission and shows progress while the request is pending', async () => {
    const user = userEvent.setup();
    let resolveRequest: (() => void) | undefined;
    const request = new Promise<void>((resolve) => { resolveRequest = resolve; });
    const onSubmit = vi.fn(() => request);
    renderTradeForm(onSubmit);
    await fillValidTrade(user);
    await user.click(screen.getByRole('button', { name: 'Record Trade' }));

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledWith({
      instrument: 'SCOM', type: 'BUY', quantity: '100', unit_price: '100', trade_date: '2026-11-24',
    });

    await act(async () => { resolveRequest?.(); });
    expect(screen.getByRole('button', { name: 'Record Trade' })).toBeEnabled();
  });

  it('keeps all entered fields after an API failure', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('Sale rejected. Check available units and retry.'));
    renderTradeForm(onSubmit);
    await fillValidTrade(user, '40');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Trade type' }), 'SELL');
    await user.click(screen.getByRole('button', { name: 'Record Trade' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sale rejected. Check available units and retry.');
    expect(screen.getByRole('textbox', { name: 'Instrument' })).toHaveValue('SCOM');
    expect(screen.getByRole('combobox', { name: 'Trade type' })).toHaveValue('SELL');
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(40);
    expect(screen.getByRole('spinbutton', { name: 'Unit price' })).toHaveValue(100);
    expect(screen.getByLabelText('Trade date')).toHaveValue('2026-11-24');
  });

  it('clears the form only after a successful request', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderTradeForm(onSubmit);
    await fillValidTrade(user);
    await user.click(screen.getByRole('button', { name: 'Record Trade' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Trade recorded.');
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: 'Unit price' })).toHaveValue(null);
  });
});
