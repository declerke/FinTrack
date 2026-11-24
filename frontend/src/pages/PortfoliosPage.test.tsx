import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Portfolio } from '../types';
import { PortfoliosPage } from './PortfoliosPage';

const apiMock = vi.hoisted(() => ({
  getPortfolios: vi.fn(),
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

function renderPortfoliosPage() {
  return render(
    <MemoryRouter>
      <PortfoliosPage />
    </MemoryRouter>,
  );
}

describe('PortfoliosPage deletion while editing', () => {
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
});
