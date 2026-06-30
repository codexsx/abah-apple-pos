import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import StokPelengkap from './StokPelengkap';

const mockNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/services/accessories', () => ({
  getAccessories: vi.fn(),
  createAccessory: vi.fn(),
  updateAccessory: vi.fn(),
  deleteAccessory: vi.fn(),
  restockAccessory: vi.fn(),
}));

import { getAccessories } from '@/services/accessories';

const mockedGetAccessories = vi.mocked(getAccessories);

function renderPage() {
  return render(
    <MemoryRouter>
      <StokPelengkap />
    </MemoryRouter>,
  );
}

describe('StokPelengkap purchase flow shortcut', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockedGetAccessories.mockReset();
    mockedGetAccessories.mockResolvedValue([]);
  });

  it('routes Tambah Pelengkap to the pembelian pelengkap flow instead of direct stock insert', async () => {
    renderPage();

    expect(await screen.findByText('Belum ada pelengkap')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Tambah Pelengkap/i })[0]);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/pembelian?pelengkap=1');
    });
  });
});
