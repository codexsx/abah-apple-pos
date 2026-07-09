// Feature: finance-menu
// Component tests for the read-only "Keuangan" finance summary page
// (Keuangan.tsx). The finance service is mocked so the page's data-loading
// behavior (loading -> loaded, and error -> retry) is fully controllable.
// The page navigates via react-router's useNavigate, so renders are wrapped
// in <MemoryRouter>.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { getFinanceSummary } from '@/services/finance';
import { useCanViewAgentMoney } from '@/hooks/useCanViewAgentMoney';
import type { FinanceSummary } from '@/services/financeCore';

// ---- Mock the service layer ----------------------------------------------
vi.mock('@/services/finance');
vi.mock('@/hooks/useCanViewAgentMoney');

// Import after the mock is registered.
import Keuangan from './Keuangan';

// ---- Fixtures --------------------------------------------------------------

function makeSummary(overrides: Partial<FinanceSummary> = {}): FinanceSummary {
  return {
    period: { from: null, to: null },
    revenue: 3_000_000,
    salesRevenue: 2_830_000,
    imeiActivationRevenue: 170_000,
    cogs: 1_200_000,
    expenses: 300_000,
    netProfit: 500_000,
    cashBankTotal: 4_000_000,
    inventoryValue: 2_500_000,
    agentReceivable: 1_000_000,
    agentDepositLiability: 250_000,
    totalAsset: 8_000_000,
    ...overrides,
  } as FinanceSummary;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Keuangan />
    </MemoryRouter>,
  );
}

describe('Keuangan page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCanViewAgentMoney).mockReturnValue(true);
  });

  it('renders headline figures once the summary resolves (loaded state)', async () => {
    vi.mocked(getFinanceSummary).mockResolvedValue(
      makeSummary({ netProfit: 500_000, totalAsset: 8_000_000 }),
    );

    renderPage();

    // Net profit (Laba Bersih) is formatted as "Rp 500.000".
    expect(await screen.findByText('Rp 500.000')).toBeInTheDocument();
    // Total asset is formatted as "Rp 8.000.000".
    expect(screen.getByText('Rp 8.000.000')).toBeInTheDocument();

    // The section labels render too.
    expect(screen.getByText('Laba Bersih')).toBeInTheDocument();
    expect(screen.getByText('Total Aset')).toBeInTheDocument();

    expect(getFinanceSummary).toHaveBeenCalledWith(undefined, { includeAgentMoney: true });
    expect(getFinanceSummary).toHaveBeenCalledTimes(1);
  });

  it('locks agent receivable/deposit for roles that cannot see agent money', async () => {
    vi.mocked(useCanViewAgentMoney).mockReturnValue(false);
    vi.mocked(getFinanceSummary).mockResolvedValue(
      makeSummary({ agentReceivable: 0, agentDepositLiability: 0, totalAsset: 6_500_000 }),
    );

    renderPage();

    expect((await screen.findAllByText('Dikunci Boss')).length).toBeGreaterThanOrEqual(2);
    expect(getFinanceSummary).toHaveBeenCalledWith(undefined, { includeAgentMoney: false });
  });

  it('shows an error with a retry button, then loads after clicking "Coba lagi"', async () => {
    vi.mocked(getFinanceSummary)
      .mockRejectedValueOnce(new Error('Gagal memuat ringkasan keuangan'))
      .mockResolvedValueOnce(makeSummary({ netProfit: 500_000, totalAsset: 8_000_000 }));

    const user = userEvent.setup();
    renderPage();

    // Error UI appears with the retry action.
    const retry = await screen.findByRole('button', { name: /Coba lagi/ });
    expect(retry).toBeInTheDocument();
    expect(screen.getByText('Gagal memuat ringkasan keuangan')).toBeInTheDocument();

    await user.click(retry);

    // Loaded figures appear after the successful retry.
    expect(await screen.findByText('Rp 500.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 8.000.000')).toBeInTheDocument();

    await waitFor(() => expect(getFinanceSummary).toHaveBeenCalledTimes(2));
  });
});
