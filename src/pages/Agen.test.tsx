import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { Agent, AgentTransaction } from '@/services/agents';

/*
 * Task 4.2 — Unit test for Agen_Page balance label (Requirement 2.5).
 *
 * The Agen_Page must display each agent's balance using the same sign
 * convention as getAgentBalance, with the label "Sisa Hutang" for agents who
 * owe money — replacing any contradictory label. The old (buggy) behavior
 * showed "LUNAS" alongside a nonzero outstanding amount for the same agent;
 * this test asserts that an owing agent shows "Sisa Hutang" and never "LUNAS".
 */

// Mock the agents service: getAgentBalance uses the REAL implementation so the
// label is derived from the same formula the production code uses.
vi.mock('@/services/agents', async (importActual) => {
  const actual = await importActual<typeof import('@/services/agents')>();
  return {
    ...actual,
    getAgents: vi.fn(),
    getAgentTransactions: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    formatAgentPhone: vi.fn((phone: string | null) => phone ?? '-'),
    // getAgentBalance stays real (spread from actual)
  };
});

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));

import {
  createAgent,
  deleteAgent,
  getAgents,
  getAgentTransactions,
  updateAgent,
} from '@/services/agents';
import { useAuth } from '@/contexts/AuthContext';

const OWING_AGENT: Agent = {
  id: 'agent-owing',
  code: 'AG01',
  name: 'Agen Berhutang',
  phone: '081234567890',
  note: 'owes money',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const SETTLED_AGENT: Agent = {
  id: 'agent-settled',
  code: 'AG02',
  name: 'Agen Lunas',
  phone: '081200000000',
  note: 'balanced',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

// Owing agent: a single Koreksi of 100000 → balance = 100000 (> 0) → "Sisa Hutang".
const OWING_TRANSACTIONS: AgentTransaction[] = [
  {
    id: 'tx-1',
    agent_id: OWING_AGENT.id,
    type: 'Koreksi',
    amount: 100000,
    method: 'Cash',
    note: 'koreksi awal',
    created_at: '2024-02-01T10:00:00.000Z',
  },
];

// Settled agent: debt (Koreksi 50000) fully paid (Stor/Bayar 50000) → balance = 0 → "LUNAS".
const SETTLED_TRANSACTIONS: AgentTransaction[] = [
  {
    id: 'tx-2',
    agent_id: SETTLED_AGENT.id,
    type: 'Koreksi',
    amount: 50000,
    method: 'Cash',
    note: 'koreksi',
    created_at: '2024-02-02T10:00:00.000Z',
  },
  {
    id: 'tx-3',
    agent_id: SETTLED_AGENT.id,
    type: 'Stor/Bayar',
    amount: 50000,
    method: 'Transfer',
    note: 'pelunasan',
    created_at: '2024-02-03T10:00:00.000Z',
  },
];

import Agen from './Agen';

function renderAgen() {
  return render(
    <MemoryRouter>
      <Agen />
    </MemoryRouter>
  );
}

describe('Agen_Page balance label (Requirement 2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      profile: {
        id: 'boss',
        name: 'Boss',
        role: 'MANAJER',
        initials: 'BO',
        email: 'boss@test.local',
        username: 'boss',
        permissions: {},
        avatar_url: null,
        avatar_crop_x: 50,
        avatar_crop_y: 50,
        avatar_zoom: 1,
      },
      isLoading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
  });

  it('shows "Sisa Hutang" for an owing agent and never "LUNAS" for that agent', async () => {
    vi.mocked(getAgents).mockResolvedValue([OWING_AGENT]);
    vi.mocked(getAgentTransactions).mockResolvedValue(OWING_TRANSACTIONS);

    renderAgen();

    // Wait for the agent list to finish loading.
    const heading = await screen.findByText(OWING_AGENT.name);
    const card = heading.closest('button') as HTMLElement;

    // The owing agent's card uses the "Sisa Hutang" label.
    expect(within(card).getByText('Sisa Hutang')).toBeInTheDocument();

    // The formatted outstanding amount is shown alongside the label on the card.
    expect(within(card).getByText('Rp 100.000')).toBeInTheDocument();

    // Contradictory old behavior is gone: an owing agent must not be labeled "LUNAS".
    expect(within(card).queryByText('LUNAS')).not.toBeInTheDocument();
    expect(screen.queryByText('LUNAS')).not.toBeInTheDocument();
  });

  it('shows "LUNAS" for an agent whose debt equals payments (balance == 0)', async () => {
    vi.mocked(getAgents).mockResolvedValue([SETTLED_AGENT]);
    vi.mocked(getAgentTransactions).mockResolvedValue(SETTLED_TRANSACTIONS);

    renderAgen();

    await screen.findByText(SETTLED_AGENT.name);

    // Balanced agent shows "LUNAS" and no "Sisa Hutang" label.
    expect(screen.getByText('LUNAS')).toBeInTheDocument();
    expect(screen.queryByText('Sisa Hutang')).not.toBeInTheDocument();
  });

  it('labels each agent independently when both are listed', async () => {
    vi.mocked(getAgents).mockResolvedValue([OWING_AGENT, SETTLED_AGENT]);
    vi.mocked(getAgentTransactions).mockResolvedValue([
      ...OWING_TRANSACTIONS,
      ...SETTLED_TRANSACTIONS,
    ]);

    renderAgen();

    const owingHeading = await screen.findByText(OWING_AGENT.name);
    const settledHeading = await screen.findByText(SETTLED_AGENT.name);

    // Each agent card is the nearest button ancestor of its heading.
    const owingCard = owingHeading.closest('button') as HTMLElement;
    const settledCard = settledHeading.closest('button') as HTMLElement;

    expect(within(owingCard).getByText('Sisa Hutang')).toBeInTheDocument();
    expect(within(owingCard).queryByText('LUNAS')).not.toBeInTheDocument();

    expect(within(settledCard).getByText('LUNAS')).toBeInTheDocument();
    expect(within(settledCard).queryByText('Sisa Hutang')).not.toBeInTheDocument();
  });

  it('opens edit dialog and saves changed agent data', async () => {
    const user = userEvent.setup();
    vi.mocked(getAgents).mockResolvedValue([OWING_AGENT]);
    vi.mocked(getAgentTransactions).mockResolvedValue(OWING_TRANSACTIONS);
    vi.mocked(updateAgent).mockResolvedValue({
      ...OWING_AGENT,
      name: 'Agen Baru',
      updated_at: '2024-02-04T10:00:00.000Z',
    });

    renderAgen();

    const heading = await screen.findByText(OWING_AGENT.name);
    await user.click(heading.closest('button') as HTMLElement);
    await user.click(screen.getByRole('button', { name: /Edit/i }));

    const nameInput = screen.getByLabelText(/Nama Agen/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Agen Baru');
    await user.click(screen.getByRole('button', { name: /Simpan Perubahan/i }));

    await waitFor(() => {
      expect(updateAgent).toHaveBeenCalledWith(
        OWING_AGENT.id,
        expect.objectContaining({ name: 'Agen Baru' }),
      );
    });
  });

  it('creates a new agent from the header action', async () => {
    const user = userEvent.setup();
    vi.mocked(getAgents).mockResolvedValue([OWING_AGENT]);
    vi.mocked(getAgentTransactions).mockResolvedValue(OWING_TRANSACTIONS);
    vi.mocked(createAgent).mockResolvedValue({
      id: 'agent-new',
      code: 'AGN-002',
      name: 'Agen Baru',
      phone: '081299988877',
      note: 'supplier baru',
      created_at: '2024-02-04T10:00:00.000Z',
      updated_at: '2024-02-04T10:00:00.000Z',
    });

    renderAgen();

    await screen.findByText(OWING_AGENT.name);
    await user.click(screen.getByRole('button', { name: /Tambah Agen/i }));

    expect(screen.getByLabelText(/Kode Agen/i)).toHaveValue('AGN-001');
    const codeInput = screen.getByLabelText(/Kode Agen/i);
    await user.clear(codeInput);
    await user.type(codeInput, 'AGN-002');
    await user.type(screen.getByLabelText(/Nama Agen/i), 'Agen Baru');
    await user.type(screen.getByLabelText(/No\. HP/i), '081299988877');
    await user.type(screen.getByLabelText(/Catatan/i), 'supplier baru');
    await user.click(screen.getByRole('button', { name: /^Tambah Agen$/i }));

    await waitFor(() => {
      expect(createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AGN-002',
          name: 'Agen Baru',
          phone: '081299988877',
          note: 'supplier baru',
        }),
      );
    });
  });

  it('confirms agent deletion from the expanded card', async () => {
    const user = userEvent.setup();
    vi.mocked(getAgents).mockResolvedValue([OWING_AGENT]);
    vi.mocked(getAgentTransactions).mockResolvedValue(OWING_TRANSACTIONS);
    vi.mocked(deleteAgent).mockResolvedValue();

    renderAgen();

    const heading = await screen.findByText(OWING_AGENT.name);
    await user.click(heading.closest('button') as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^Hapus$/i }));
    await user.click(screen.getByRole('button', { name: /Hapus Agen/i }));

    await waitFor(() => {
      expect(deleteAgent).toHaveBeenCalledWith(OWING_AGENT.id);
    });
  });

  it('hides agent money and skips transaction fetching for non-boss staff', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      profile: {
        id: 'kasir',
        name: 'Kasir',
        role: 'KASIR',
        initials: 'KA',
        email: 'kasir@test.local',
        username: 'kasir',
        permissions: {},
        avatar_url: null,
        avatar_crop_x: 50,
        avatar_crop_y: 50,
        avatar_zoom: 1,
      },
      isLoading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
    vi.mocked(getAgents).mockResolvedValue([OWING_AGENT]);
    vi.mocked(getAgentTransactions).mockResolvedValue(OWING_TRANSACTIONS);

    renderAgen();

    await screen.findByText(OWING_AGENT.name);

    expect(getAgentTransactions).not.toHaveBeenCalled();
    expect(screen.queryByText('Rp 100.000')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Nominal agen dikunci/i).length).toBeGreaterThan(0);
  });
});
