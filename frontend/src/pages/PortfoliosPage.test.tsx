import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../styles.css';
import type { Portfolio, PortfolioInput } from '../types';
import { PortfoliosPage } from './PortfoliosPage';

const apiMock = vi.hoisted(() => ({
  getPortfolios: vi.fn(),
  createPortfolio: vi.fn(),
  updatePortfolio: vi.fn(),
  deletePortfolio: vi.fn(),
}));

vi.mock('../api', () => ({ api: apiMock }));

const alphaPortfolio: Portfolio = {
  id: 1,
  name: 'Alpha portfolio',
  client_name: 'Alpha client',
  base_currency: 'KES',
  created_at: '2026-11-20T00:00:00Z',
};

const betaPortfolio: Portfolio = {
  id: 2,
  name: 'Beta portfolio',
  client_name: 'Beta client',
  base_currency: 'USD',
  created_at: '2026-11-21T00:00:00Z',
};

let currentPortfolios: Portfolio[];

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPortfoliosPage() {
  return render(
    <MemoryRouter>
      <PortfoliosPage />
    </MemoryRouter>,
  );
}

describe('PortfoliosPage deletion and long-name layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPortfolios = [alphaPortfolio, betaPortfolio];
    apiMock.getPortfolios.mockImplementation(async () => currentPortfolios);
    apiMock.deletePortfolio.mockImplementation(async (id: number) => {
      currentPortfolios = currentPortfolios.filter((portfolio) => portfolio.id !== id);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('resets to a blank create form after deleting the portfolio being edited', async () => {
    const user = userEvent.setup();
    renderPortfoliosPage();
    await user.click(await screen.findByRole('button', { name: 'Edit Alpha portfolio' }));
    const nameInput = screen.getByRole('textbox', { name: 'Portfolio name' });
    const clientInput = screen.getByRole('textbox', { name: 'Client name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'Unsaved alpha edit');
    await user.clear(clientInput);
    await user.type(clientInput, 'Unsaved client edit');

    await user.click(screen.getByRole('button', { name: 'Delete Alpha portfolio' }));

    expect(await screen.findByRole('heading', { name: 'Create portfolio' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Portfolio name' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Client name' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Create portfolio' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancel edit' })).not.toBeInTheDocument();
  });

  it('preserves unsaved edits when deletion is cancelled', async () => {
    const user = userEvent.setup();
    renderPortfoliosPage();
    await user.click(await screen.findByRole('button', { name: 'Edit Alpha portfolio' }));
    const nameInput = screen.getByRole('textbox', { name: 'Portfolio name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'Unsaved alpha edit');
    vi.mocked(window.confirm).mockReturnValue(false);

    await user.click(screen.getByRole('button', { name: 'Delete Alpha portfolio' }));

    expect(screen.getByRole('heading', { name: 'Edit portfolio' })).toBeVisible();
    expect(nameInput).toHaveValue('Unsaved alpha edit');
    expect(apiMock.deletePortfolio).not.toHaveBeenCalled();
  });

  it('keeps the current edit when deleting a different portfolio', async () => {
    const user = userEvent.setup();
    renderPortfoliosPage();
    await user.click(await screen.findByRole('button', { name: 'Edit Alpha portfolio' }));
    const nameInput = screen.getByRole('textbox', { name: 'Portfolio name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'Unsaved alpha edit');

    await user.click(screen.getByRole('button', { name: 'Delete Beta portfolio' }));

    expect(await screen.findByRole('heading', { name: 'Edit portfolio' })).toBeVisible();
    expect(nameInput).toHaveValue('Unsaved alpha edit');
    expect(screen.queryByRole('link', { name: 'Beta portfolio' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alpha portfolio' })).toBeVisible();
  });

  it('allows full 100-character portfolio and client names to wrap', async () => {
    const user = userEvent.setup();
    const longPortfolioName = 'P'.repeat(100);
    const longClientName = 'C'.repeat(100);
    currentPortfolios = [{
      ...alphaPortfolio,
      name: longPortfolioName,
      client_name: longClientName,
    }];

    renderPortfoliosPage();

    const nameLink = await screen.findByRole('link', { name: longPortfolioName });
    const clientName = screen.getByText(longClientName);

    expect(nameLink).toHaveTextContent(longPortfolioName);
    expect(nameLink).toHaveStyle({ minWidth: '0px', overflowWrap: 'anywhere' });
    expect(clientName).toHaveTextContent(longClientName);
    expect(clientName).toHaveStyle({ overflowWrap: 'anywhere' });

    await user.click(screen.getByRole('button', { name: `Delete ${longPortfolioName}` }));

    const deletionNotice = await screen.findByRole('status');
    expect(deletionNotice).toHaveTextContent(`${longPortfolioName} deleted.`);
    expect(deletionNotice).toHaveStyle({ overflowWrap: 'anywhere' });
  });
});

describe('PortfoliosPage request states', () => {
  beforeEach(() => {
    currentPortfolios = [alphaPortfolio, betaPortfolio];
    apiMock.getPortfolios.mockImplementation(async () => currentPortfolios);
    apiMock.createPortfolio.mockImplementation(async (input: PortfolioInput) => {
      const createdPortfolio = { ...alphaPortfolio, ...input, id: 3 };
      currentPortfolios = [...currentPortfolios, createdPortfolio];
      return createdPortfolio;
    });
    apiMock.updatePortfolio.mockImplementation(async (id: number, input: PortfolioInput) => {
      const updatedPortfolio = { ...alphaPortfolio, ...input, id };
      currentPortfolios = currentPortfolios.map((portfolio) => portfolio.id === id ? updatedPortfolio : portfolio);
      return updatedPortfolio;
    });
    apiMock.deletePortfolio.mockImplementation(async (id: number) => {
      currentPortfolios = currentPortfolios.filter((portfolio) => portfolio.id !== id);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows list loading and an error before a retry can show the empty workspace', async () => {
    const user = userEvent.setup();
    const initialRead = deferred<Portfolio[]>();
    const retryRead = deferred<Portfolio[]>();
    apiMock.getPortfolios.mockReturnValueOnce(initialRead.promise).mockReturnValueOnce(retryRead.promise);
    renderPortfoliosPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading portfolios');
    expect(screen.queryByRole('heading', { name: 'Your workspace is ready' })).not.toBeInTheDocument();

    await act(async () => { initialRead.reject(new Error('The portfolio list is unavailable.')); });

    expect(await screen.findByRole('alert')).toHaveTextContent('The portfolio list is unavailable.');
    expect(screen.queryByRole('heading', { name: 'Your workspace is ready' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading portfolios');

    await act(async () => { retryRead.resolve([]); });

    expect(await screen.findByRole('heading', { name: 'Your workspace is ready' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    { operation: 'create', submitName: 'Create portfolio', apiCall: apiMock.createPortfolio },
    { operation: 'update', submitName: 'Save changes', apiCall: apiMock.updatePortfolio },
  ] as const)('keeps failed $operation input and blocks repeated submission while pending', async ({
    operation, submitName, apiCall,
  }) => {
    const user = userEvent.setup();
    const saveRequest = deferred<Portfolio>();
    apiCall.mockReturnValueOnce(saveRequest.promise);
    renderPortfoliosPage();
    const edit = await screen.findByRole('button', { name: 'Edit Alpha portfolio' });
    if (operation === 'update') await user.click(edit);

    const name = screen.getByRole('textbox', { name: 'Portfolio name' });
    const client = screen.getByRole('textbox', { name: 'Client name' });
    const currency = screen.getByRole('combobox', { name: 'Base currency' });
    await user.clear(name);
    await user.clear(client);
    await user.type(name, 'New name');
    await user.type(client, 'New client');
    await user.selectOptions(currency, 'USD');

    const submit = screen.getByRole('button', { name: submitName });
    await user.click(submit);
    expect(submit).toHaveAccessibleName('Saving…');
    expect(submit).toBeDisabled();
    expect(name).toBeDisabled();
    await user.click(submit);
    expect(apiCall).toHaveBeenCalledTimes(1);

    await act(async () => { saveRequest.reject(new Error('The portfolio could not be saved.')); });

    expect(await screen.findByRole('alert')).toHaveTextContent('The portfolio could not be saved.');
    expect(name).toHaveValue('New name');
    expect(client).toHaveValue('New client');
    expect(currency).toHaveValue('USD');
    expect(submit).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'New name' })).not.toBeInTheDocument();

    await user.click(submit);

    expect(await screen.findByRole('link', { name: 'New name' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(Boolean(screen.queryByRole('link', { name: 'Alpha portfolio' }))).toBe(operation === 'create');
  });

  it('blocks competing saves and deletes while deletion is pending and keeps the editor after failure', async () => {
    const user = userEvent.setup();
    const deleteRequest = deferred<void>();
    apiMock.deletePortfolio.mockReturnValueOnce(deleteRequest.promise);
    renderPortfoliosPage();
    await user.click(await screen.findByRole('button', { name: 'Edit Alpha portfolio' }));
    const name = screen.getByRole('textbox', { name: 'Portfolio name' });
    await user.clear(name);
    await user.type(name, 'Edited name');

    const firstDelete = screen.getByRole('button', { name: 'Delete Alpha portfolio' });
    const secondDelete = screen.getByRole('button', { name: 'Delete Beta portfolio' });
    const save = screen.getByRole('button', { name: 'Save changes' });
    await user.click(firstDelete);
    expect(firstDelete).toHaveTextContent('Deleting…');
    expect(firstDelete).toBeDisabled();
    expect(secondDelete).toBeDisabled();
    await user.click(firstDelete);
    await user.click(secondDelete);
    expect(apiMock.deletePortfolio).toHaveBeenCalledExactlyOnceWith(alphaPortfolio.id);
    expect(save).toBeDisabled();
    await user.click(save);
    expect(apiMock.updatePortfolio).not.toHaveBeenCalled();

    await act(async () => { deleteRequest.reject(new Error('The portfolio could not be deleted.')); });

    expect(await screen.findByRole('alert')).toHaveTextContent('The portfolio could not be deleted.');
    expect(screen.getByRole('link', { name: 'Alpha portfolio' })).toBeVisible();
    expect(name).toHaveValue('Edited name');
    expect(save).toBeEnabled();
    expect(firstDelete).toBeEnabled();

    await user.click(firstDelete);

    expect(await screen.findByRole('status')).toHaveTextContent('Alpha portfolio deleted.');
    expect(screen.queryByRole('link', { name: 'Alpha portfolio' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta portfolio' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries the list read after a committed write without creating another portfolio', async () => {
    const user = userEvent.setup();
    const refreshRead = deferred<Portfolio[]>();
    apiMock.getPortfolios.mockResolvedValueOnce([alphaPortfolio, betaPortfolio]).mockReturnValueOnce(refreshRead.promise);
    renderPortfoliosPage();

    await screen.findByRole('link', { name: 'Alpha portfolio' });
    await user.type(screen.getByRole('textbox', { name: 'Portfolio name' }), 'New name');
    await user.type(screen.getByRole('textbox', { name: 'Client name' }), 'New client');
    await user.click(screen.getByRole('button', { name: 'Create portfolio' }));
    expect(await screen.findByText('Portfolio created.')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Loading portfolios…')).toHaveAttribute('role', 'status');

    await act(async () => { refreshRead.reject(new Error('The portfolio list is unavailable.')); });

    expect(await screen.findByRole('alert')).toHaveTextContent('The portfolio list is unavailable.');
    expect(screen.getByRole('textbox', { name: 'Portfolio name' })).toHaveValue('');
    expect(screen.getByText('Portfolio created.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: 'New name' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(apiMock.createPortfolio).toHaveBeenCalledTimes(1);
  });

  it('keeps the saved portfolio visible when the initial list response arrives late', async () => {
    const user = userEvent.setup();
    const initialRead = deferred<Portfolio[]>();
    apiMock.getPortfolios.mockReturnValueOnce(initialRead.promise);
    renderPortfoliosPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading portfolios');
    await user.type(screen.getByRole('textbox', { name: 'Portfolio name' }), 'New name');
    await user.type(screen.getByRole('textbox', { name: 'Client name' }), 'New client');
    await user.click(screen.getByRole('button', { name: 'Create portfolio' }));
    expect(await screen.findByRole('link', { name: 'New name' })).toBeVisible();

    await act(async () => { initialRead.resolve([alphaPortfolio, betaPortfolio]); });

    expect(screen.getByRole('link', { name: 'New name' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Alpha portfolio' })).toBeVisible();
  });
});
