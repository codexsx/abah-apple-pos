// Feature: stock-source-of-truth (Phase 3) — task 7.2
// Page-level tests for the DR HTM POS Stock management page (`Stok`). The
// default active tab is "Stok HP" (`TabStokHP`), which loads the live stock
// units from `@/services/stock`, renders each unit as a `role="listitem"` with
// its IMEI indicator and status badge, and lets the user change a unit's status
// via the embedded `StatusEditor` (a `role="radiogroup"`).
//
// We mock only the service boundary (`getStockItems`, `updateStockStatus`) and
// keep the `StockItem` type re-export real. The page uses `useNavigate`, so it
// is wrapped in `MemoryRouter`.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { StockItem } from '@/services/stock';

// ---------------------------------------------------------------------------
// Mock the stock service. The page imports getStockItems / updateStockStatus
// (and createStockItem) from this module; we replace the two we exercise with
// controllable vi.fn()s. createStockItem is unused by these tests but provided
// so the import resolves.
// ---------------------------------------------------------------------------
vi.mock('@/services/stock', () => ({
  getStockItems: vi.fn(),
  updateStockStatus: vi.fn(),
  updateStockItem: vi.fn(),
  moveStockUnitStatus: vi.fn(),
  createStockItem: vi.fn(),
}));

import { getStockItems, updateStockStatus, updateStockItem, moveStockUnitStatus } from '@/services/stock';
import Stok from './Stok';

const mockGetStockItems = vi.mocked(getStockItems);
const mockUpdateStockStatus = vi.mocked(updateStockStatus);
const mockUpdateStockItem = vi.mocked(updateStockItem);
const mockMoveStockUnitStatus = vi.mocked(moveStockUnitStatus);

// ---------------------------------------------------------------------------
// Fixtures matching the real StockItem shape.
//   u1 — a READY iPhone 14 Pro with an IMEI.
//   u2 — a RUSAK iPhone XR with no IMEI ("Tanpa IMEI").
// ---------------------------------------------------------------------------
function makeUnit(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: 'u1',
    model: 'iPhone 14 Pro',
    capacity: '128GB',
    condition: 'Second iBox',
    color: 'Deep Purple',
    imei: '352461789012341',
    has_imei: true,
    status: 'READY',
    count: 1,
    price: 12_500_000,
    cost_price: 10_000_000,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const u1: StockItem = makeUnit();
const u2: StockItem = makeUnit({
  id: 'u2',
  model: 'iPhone XR',
  capacity: '64GB',
  condition: 'Second',
  color: 'Coral',
  imei: null,
  has_imei: false,
  status: 'RUSAK',
  price: 3_500_000,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Stok />
    </MemoryRouter>,
  );
}

/** Find a unit's row (`role="listitem"`) by its visible model text. */
async function findRowByModel(model: string): Promise<HTMLElement> {
  const modelEl = await screen.findByText(model);
  const row = modelEl.closest('[role="listitem"]');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

beforeEach(() => {
  mockGetStockItems.mockReset();
  mockUpdateStockStatus.mockReset();
  mockUpdateStockItem.mockReset();
  mockMoveStockUnitStatus.mockReset();
});

// ===========================================================================
// 1. Loaded list renders (Req 6.1, 6.4)
// ===========================================================================
describe('loaded list', () => {
  it('renders each unit with its model, IMEI indicator, and status badge after the async load', async () => {
    mockGetStockItems.mockResolvedValueOnce([u1, u2]);

    renderPage();

    // Service is queried on mount.
    expect(mockGetStockItems).toHaveBeenCalledTimes(1);

    // u1: model + IMEI string render (READY section is open by default).
    const row1 = await findRowByModel('iPhone 14 Pro');
    expect(within(row1).getByText('352461789012341')).toBeInTheDocument();

    // u1 shows a READY status badge. READY text appears both in the badge and
    // as a radio option, so scope to the row and assert at least one match.
    expect(within(row1).getAllByText('READY').length).toBeGreaterThan(0);

    // u2: shown in the RUSAK section. Open it, then assert the no-IMEI marker.
    fireEvent.click(screen.getByRole('button', { name: /RUSAK/i }));
    const row2 = await findRowByModel('iPhone XR');
    expect(within(row2).getByText('Tanpa IMEI')).toBeInTheDocument();
  });
});

// ===========================================================================
// 2. Status edit calls the service (Req 5.5, 6.5)
// ===========================================================================
describe('status edit', () => {
  it('calls updateStockStatus once with (unit id, target) when a different status radio is selected', async () => {
    mockGetStockItems.mockResolvedValueOnce([u1, u2]);
    mockUpdateStockStatus.mockResolvedValueOnce(makeUnit({ status: 'SERVIS' }));

    renderPage();

    // Scope to u1's row so its StatusEditor radiogroup is unambiguous.
    const row1 = await findRowByModel('iPhone 14 Pro');
    const group = within(row1).getByRole('radiogroup', { name: 'Ubah status stok' });
    const servisRadio = within(group).getByRole('radio', { name: 'SERVIS' });

    fireEvent.click(servisRadio);

    await waitFor(() => expect(mockUpdateStockStatus).toHaveBeenCalledTimes(1));
    expect(mockUpdateStockStatus).toHaveBeenCalledWith('u1', 'SERVIS');
  });

  it('surfaces an inline error and leaves the status unchanged when the update fails', async () => {
    mockGetStockItems.mockResolvedValueOnce([u1]);
    mockUpdateStockStatus.mockRejectedValueOnce(new Error('db down'));

    renderPage();

    const row1 = await findRowByModel('iPhone 14 Pro');
    const group = within(row1).getByRole('radiogroup', { name: 'Ubah status stok' });
    fireEvent.click(within(group).getByRole('radio', { name: 'SERVIS' }));

    expect(
      await within(row1).findByText('Gagal memperbarui status. Silakan coba lagi.'),
    ).toBeInTheDocument();
    expect(mockUpdateStockStatus).toHaveBeenCalledWith('u1', 'SERVIS');
  });

  it('moves only one no-IMEI grouped unit to SERVIS instead of updating the whole stock row', async () => {
    const grouped = makeUnit({
      id: 'bulk-1',
      model: 'iPhone 11',
      capacity: '128GB',
      condition: 'Second Inter',
      color: 'Random',
      imei: null,
      has_imei: false,
      status: 'READY',
      count: 10,
      price: 3_500_000,
      cost_price: 3_000_000,
    });
    mockGetStockItems.mockResolvedValueOnce([grouped]);
    mockMoveStockUnitStatus.mockResolvedValueOnce([
      { ...grouped, count: 9 },
      { ...grouped, id: 'service-1', count: 1, status: 'SERVIS' },
    ]);

    renderPage();

    const row = await findRowByModel('iPhone 11');
    const group = within(row).getByRole('radiogroup', { name: 'Ubah status stok' });
    fireEvent.click(within(group).getByRole('radio', { name: 'SERVIS' }));

    await waitFor(() => expect(mockMoveStockUnitStatus).toHaveBeenCalledTimes(1));
    expect(mockMoveStockUnitStatus).toHaveBeenCalledWith('bulk-1', 'SERVIS');
    expect(mockUpdateStockStatus).not.toHaveBeenCalled();
  });
});

describe('direct unit edit', () => {
  it('updates editable stock fields from the stock row dialog', async () => {
    mockGetStockItems.mockResolvedValueOnce([u1]);
    mockUpdateStockItem.mockResolvedValueOnce({
      ...u1,
      imei: '359481985375087',
      price: 13_000_000,
      defect_description: 'Kaca kamera pecah',
    });

    renderPage();

    const row = await findRowByModel('iPhone 14 Pro');
    fireEvent.click(within(row).getByRole('button', { name: /edit unit iphone 14 pro/i }));

    fireEvent.change(screen.getByLabelText(/imei/i), {
      target: { value: '359481985375087' },
    });
    fireEvent.change(screen.getByLabelText(/harga jual/i), {
      target: { value: '13.000.000' },
    });
    fireEvent.change(screen.getByLabelText(/keterangan minus/i), {
      target: { value: 'Kaca kamera pecah' },
    });
    fireEvent.click(screen.getByRole('button', { name: /simpan perubahan/i }));

    await waitFor(() => expect(mockUpdateStockItem).toHaveBeenCalledTimes(1));
    expect(mockUpdateStockItem).toHaveBeenCalledWith('u1', {
      model: 'iPhone 14 Pro',
      capacity: '128GB',
      condition: 'Second iBox',
      color: 'Deep Purple',
      has_imei: true,
      imei: '359481985375087',
      price: 13_000_000,
      cost_price: 10_000_000,
      battery_health: null,
      defect_description: 'Kaca kamera pecah',
    });
  });
});

// ===========================================================================
// 3. Error + retry state (Req 6.2, 6.3)
// ===========================================================================
describe('error state', () => {
  it('renders the error alert with a retry button when the fetch rejects, and reloads on retry', async () => {
    mockGetStockItems.mockRejectedValueOnce(new Error('Network down'));

    renderPage();

    // Error alert + heading appear.
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Gagal memuat stok')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /coba lagi/i });
    expect(retryButton).toBeInTheDocument();

    // Retrying refetches; the second call resolves and the list renders.
    mockGetStockItems.mockResolvedValueOnce([u1]);
    fireEvent.click(retryButton);

    await waitFor(() => expect(mockGetStockItems).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('iPhone 14 Pro')).toBeInTheDocument();
  });
});
