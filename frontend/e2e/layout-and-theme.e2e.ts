import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Portfolio, PortfolioSummary, Transaction } from '../src/types';

const portfolio: Portfolio = {
  id: 42,
  name: 'W'.repeat(100),
  client_name: 'M'.repeat(100),
  base_currency: 'KES',
  created_at: '2026-11-20T00:00:00Z',
};
const trade: Transaction = {
  id: 43,
  portfolio_id: portfolio.id,
  instrument: 'SCOM',
  type: 'BUY',
  quantity: '10',
  unit_price: '120',
  trade_date: '2026-11-20',
  created_at: '2026-11-20T09:00:00Z',
};
const summary: PortfolioSummary = {
  portfolio_id: portfolio.id,
  base_currency: 'KES',
  total_invested: '1200',
  total_value: '1200',
  positions: [{
    instrument: trade.instrument,
    net_quantity: '10',
    average_cost: '120',
    total_invested: '1200',
    valuation_price: '120',
    total_value: '1200',
    allocation_percentage: 100,
  }],
};

test.beforeEach(async ({ context }) => {
  const detailPath = `/api/portfolios/${portfolio.id}`;
  const fixtures = new Map<string, object>([
    ['POST /api/auth/login', { access_token: 'browser-fixture', token_type: 'bearer' }],
    ['GET /api/portfolios', [portfolio]],
    [`GET ${detailPath}`, portfolio],
    [`GET ${detailPath}/summary`, summary],
    [`GET ${detailPath}/transactions`, [trade]],
  ]);
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const fixture = fixtures.get(`${request.method()} ${new URL(request.url()).pathname}`);
    if (fixture) await route.fulfill({ json: fixture });
    else await route.abort();
  });
});

async function signIn(page: Page) {
  await page.getByLabel('Username').fill('fictional-analyst');
  await page.getByLabel('Password').fill('fixture-only');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

async function expectNoDocumentOverflow(page: Page, view: string) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  await test.info().attach(`${view} widths`, {
    body: JSON.stringify(widths),
    contentType: 'application/json',
  });
  expect(widths.viewport).toBe(375);
  expect(widths.scrollWidth).toBe(widths.clientWidth);
  expect(widths.bodyScrollWidth).toBeLessThanOrEqual(widths.clientWidth);
}

async function expectWithinDocumentWidth(locator: Locator) {
  await expect(locator).toBeVisible();
  const { left, right, documentWidth } = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, documentWidth: document.documentElement.clientWidth };
  });
  expect(left).toBeGreaterThanOrEqual(0);
  expect(right).toBeLessThanOrEqual(documentWidth);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} at 375px`, () => {
    test.use({ colorScheme: theme, viewport: { width: 375, height: 812 } });

    test('contains long names and keeps actions and tables reachable', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await signIn(page);

      const portfolioLink = page.getByRole('link', { name: portfolio.name, exact: true });
      await expect(portfolioLink).toBeVisible();
      await expectNoDocumentOverflow(page, `${theme} list`);
      await expectWithinDocumentWidth(portfolioLink);
      await expectWithinDocumentWidth(page.getByText(portfolio.client_name, { exact: true }));
      await expectWithinDocumentWidth(page.getByRole('button', { name: `Edit ${portfolio.name}` }));
      await expectWithinDocumentWidth(page.getByRole('button', { name: `Delete ${portfolio.name}` }));
      await expectWithinDocumentWidth(page.getByLabel('Base currency'));

      await portfolioLink.click();
      await expectWithinDocumentWidth(page.getByRole('heading', { name: portfolio.name, exact: true }));
      await expectWithinDocumentWidth(page.getByText(`${portfolio.client_name} · Created`));
      await expectWithinDocumentWidth(page.getByRole('button', { name: 'Record Trade' }));
      for (const label of ['Holdings table.', 'Transactions table.']) {
        const table = page.getByRole('region', { name: `${label} Scroll horizontally to see all columns.` });
        await expectWithinDocumentWidth(table);
        const widths = await table.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        await test.info().attach(`${theme} ${label} widths`, {
          body: JSON.stringify(widths),
          contentType: 'application/json',
        });
        expect(widths.scrollWidth).toBeGreaterThan(widths.clientWidth);
        await table.focus();
        await expect(table).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      }
      await expectNoDocumentOverflow(page, `${theme} detail`);
    });
  });
}

test('keeps a manually selected theme across sign-in, sign-out and reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');
  const toggle = page.getByRole('button', { name: 'Dark mode' });
  const document = page.locator('html');
  await expect(document).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(document).toHaveAttribute('data-theme', 'dark');

  await signIn(page);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(document).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(document).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(document).toHaveAttribute('data-theme', 'dark');
});
