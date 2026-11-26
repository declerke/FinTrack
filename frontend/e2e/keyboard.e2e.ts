import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Portfolio, PortfolioInput, Transaction, TransactionInput } from '../src/types';

const portfolioId = 42;
const portfolioPath = `/api/portfolios/${portfolioId}`;
const fixtureDate = '2026-11-20T00:00:00Z';

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let tabs = 0; tabs < 30; tabs += 1) {
    if (await target.evaluate((element) => document.activeElement === element)) return;
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    if (await focused.count()) await expect(focused).toBeInViewport();
  }
  await expect(target).toBeFocused();
}

async function enterText(page: Page, target: Locator, value: string) {
  await tabTo(page, target);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(value);
}

async function pressEnterOn(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press('Enter');
}

test('operates the portfolio and ledger by keyboard and returns focus after deletion', async ({ page }) => {
  const fixture: { portfolio?: Portfolio } = {};
  let trades: Transaction[] = [];
  const deletes: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    switch (`${request.method()} ${path}`) {
      case 'POST /api/auth/login':
        return route.fulfill({ json: { access_token: 'keyboard-fixture', token_type: 'bearer' } });
      case 'GET /api/portfolios':
        return route.fulfill({ json: fixture.portfolio ? [fixture.portfolio] : [] });
      case 'POST /api/portfolios':
      case `PUT ${portfolioPath}`: {
        const input = request.postDataJSON() as PortfolioInput;
        fixture.portfolio = { ...input, id: portfolioId, created_at: fixtureDate };
        return route.fulfill({ status: request.method() === 'POST' ? 201 : 200, json: fixture.portfolio });
      }
      case `GET ${portfolioPath}`:
        return fixture.portfolio ? route.fulfill({ json: fixture.portfolio }) : route.fulfill({ status: 404 });
      case `DELETE ${portfolioPath}`:
        deletes.push(path);
        delete fixture.portfolio;
        trades = [];
        return route.fulfill({ status: 204 });
      case `GET ${portfolioPath}/transactions`:
        return route.fulfill({ json: trades });
      case `POST ${portfolioPath}/transactions`: {
        const input = request.postDataJSON() as TransactionInput;
        const trade = { ...input, id: trades.length + 1, portfolio_id: portfolioId, created_at: fixtureDate };
        trades.push(trade);
        return route.fulfill({ status: 201, json: trade });
      }
      case 'DELETE /api/transactions/1':
        deletes.push(path);
        trades = trades.filter((trade) => String(trade.id) !== path.split('/').at(-1));
        return route.fulfill({ status: 204 });
      case `GET ${portfolioPath}/summary`:
        return route.fulfill({ json: {
          portfolio_id: portfolioId, base_currency: 'KES', positions: [], total_invested: '0', total_value: '0',
        } });
      default:
        return route.abort();
    }
  });
  // Control the confirmation result to exercise application focus and mutations.
  // Browser chrome keyboard handling is outside this fixture test.
  await page.addInitScript(() => {
    const cancelled = new Set<string>();
    window.confirm = (message = '') => {
      if (cancelled.has(message)) return true;
      cancelled.add(message);
      return false;
    };
  });

  await page.goto('/login');
  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
  await page.keyboard.press('Tab');
  const toggleTheme = page.getByRole('button', { name: 'Dark mode' });
  await expect(toggleTheme).toBeFocused();
  await expect(toggleTheme).toHaveCSS('outline-style', 'solid');
  await expect(toggleTheme).not.toHaveCSS('outline-width', '0px');

  await enterText(page, page.getByLabel('Username'), 'fictional-analyst');
  await enterText(page, page.getByLabel('Password'), 'fixture-only');
  await pressEnterOn(page, page.getByRole('button', { name: 'Sign in' }));
  await expect(page.getByRole('heading', { name: 'Your workspace is ready' })).toBeVisible();

  const portfolioName = page.getByLabel('Portfolio name');
  await enterText(page, portfolioName, 'Keyboard QA');
  await enterText(page, page.getByLabel('Client name'), 'Fictional client');
  await pressEnterOn(page, page.getByRole('button', { name: 'Create portfolio' }));
  await expect(page.getByRole('link', { name: 'Keyboard QA' })).toBeVisible();
  expect(fixture.portfolio?.name).toBe('Keyboard QA');

  await pressEnterOn(page, page.getByRole('button', { name: 'Edit Keyboard QA' }));
  await expect(portfolioName).toBeFocused();
  await enterText(page, portfolioName, 'Keyboard QA edited');
  await pressEnterOn(page, page.getByRole('button', { name: 'Save changes' }));
  await pressEnterOn(page, page.getByRole('link', { name: 'Keyboard QA edited' }));
  expect(fixture.portfolio?.name).toBe('Keyboard QA edited');

  const recordTrade = page.getByRole('button', { name: 'Record Trade' });
  const instrumentInput = page.getByLabel('Instrument', { exact: true });
  await pressEnterOn(page, recordTrade);
  await expect(instrumentInput).toBeFocused();
  await expect(instrumentInput).toHaveAttribute('aria-invalid', 'true');
  await expect(instrumentInput).toHaveAccessibleDescription(/Enter an instrument symbol/);
  expect(trades).toHaveLength(0);

  const table = page.getByRole('table', { name: 'Transactions' });
  const instrumentCell = (name: string) => table.getByRole('cell', { name, exact: true });
  for (const [instrument, quantity, price] of [['SCOM', '2', '100'], ['EQTY', '3', '25']]) {
    await enterText(page, instrumentInput, instrument);
    await enterText(page, page.getByLabel('Quantity', { exact: true }), quantity);
    await enterText(page, page.getByLabel('Unit price'), price);
    await pressEnterOn(page, recordTrade);
    await expect(instrumentCell(instrument)).toBeVisible();
  }
  expect(trades.map((trade) => trade.instrument)).toEqual(['SCOM', 'EQTY']);

  const firstInstrument = table.getByRole('row').nth(1).getByRole('cell').nth(1);
  const sort = page.getByLabel('Sort transactions');
  await tabTo(page, sort);
  await page.keyboard.press('ArrowDown');
  await expect(sort).toHaveValue('amount');
  await expect(firstInstrument).toHaveText('SCOM');
  const order = page.getByLabel('Sort order');
  await tabTo(page, order);
  await page.keyboard.press('ArrowDown');
  await expect(order).toHaveValue('ascending');
  await expect(firstInstrument).toHaveText('EQTY');

  const symbol = page.getByLabel('Filter by symbol');
  await enterText(page, symbol, 'ZZZZ');
  await expect(page.getByRole('heading', { name: 'No trades match these filters.' })).toBeVisible();
  await enterText(page, symbol, 'scom');
  await expect(instrumentCell('SCOM')).toBeVisible();
  await expect(instrumentCell('EQTY')).toHaveCount(0);

  const deleteBuy = page.getByRole('button', { name: 'Delete buy SCOM trade' });
  await pressEnterOn(page, deleteBuy);
  expect(deletes).toEqual([]);
  await expect(deleteBuy).toBeFocused();
  await expect(instrumentCell('SCOM')).toBeVisible();
  await pressEnterOn(page, deleteBuy);
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeFocused();
  await expect(deleteBuy).toHaveCount(0);
  expect(trades.map((trade) => trade.instrument)).toEqual(['EQTY']);
  expect(deletes).toEqual(['/api/transactions/1']);

  await pressEnterOn(page, page.getByRole('link', { name: /All portfolios/ }));
  const deletePortfolio = page.getByRole('button', { name: 'Delete Keyboard QA edited' });
  await pressEnterOn(page, deletePortfolio);
  await expect(deletePortfolio).toBeFocused();
  expect(fixture.portfolio?.name).toBe('Keyboard QA edited');
  expect(deletes).toEqual(['/api/transactions/1']);
  await pressEnterOn(page, deletePortfolio);
  await expect(page.getByRole('heading', { name: 'Client portfolios' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Your workspace is ready' })).toBeVisible();
  expect(fixture.portfolio).toBeUndefined();
  expect(trades).toHaveLength(0);
  expect(deletes).toEqual(['/api/transactions/1', portfolioPath]);

  await pressEnterOn(page, page.getByRole('button', { name: 'Sign out' }));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
