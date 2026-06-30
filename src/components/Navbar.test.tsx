import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

// Mock the auth context so the component never reaches Supabase. The Navbar
// only consumes `profile` and `signOut`, so a minimal fake is sufficient.
const signOutMock = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    profile: { name: 'Test User', initials: 'TU', role: 'KASIR', email: 'test@example.com' },
    isLoading: false,
    signIn: vi.fn(),
    signOut: signOutMock,
  }),
}));

import Navbar from './Navbar';

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );
}

describe('Navbar — Operasi section (Requirements 4.1, 4.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render an "Utang Upah" link anywhere in the navigation', () => {
    const { container } = renderNavbar();
    // The link must not appear in the closed-drawer markup...
    expect(container.textContent ?? '').not.toContain('Utang Upah');
    // ...nor anywhere in the document (e.g. portalled content).
    expect(screen.queryByText('Utang Upah')).toBeNull();
  });

  it('reserves a desktop brand slot so the company profile does not overlap the nav menu', () => {
    renderNavbar();

    expect(screen.getByRole('link', { name: /Sixcode Smart OS/i })).toHaveClass('lg:w-[190px]');
  });

  it('keeps Stok and Agen present in the desktop pill navigation', () => {
    renderNavbar();

    const stokLink = screen.getByRole('link', { name: 'Stok' });
    const agenLink = screen.getByRole('link', { name: 'Agen' });

    expect(screen.getByRole('link', { name: 'Tukar' })).toBeTruthy();
    expect(stokLink).toBeTruthy();
    expect(agenLink).toBeTruthy();
    expect(stokLink.parentElement).toHaveClass('overflow-x-auto');
  });

  it('still renders the Operasi section and its remaining links when the menu is opened', async () => {
    const user = userEvent.setup();
    renderNavbar();

    // Open the quick-access Sheet drawer that holds the grouped nav sections.
    await user.click(screen.getByRole('button', { name: 'Menu cepat' }));

    // The Operasi section header renders...
    const operasiHeading = await screen.findByRole('heading', { name: 'Operasi' });
    expect(operasiHeading).toBeTruthy();

    // ...with its expected remaining links and no "Utang Upah".
    expect(screen.getByRole('link', { name: /Ambil Pelengkap/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Pemasukan Lain & Transfer Kas/ })).toBeTruthy();
    expect(screen.queryByText('Utang Upah')).toBeNull();
  });

  it('keeps other known navigation labels working (Servis, Manajemen Agen)', async () => {
    const user = userEvent.setup();
    renderNavbar();

    await user.click(screen.getByRole('button', { name: 'Menu cepat' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /Servis/ })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: /Manajemen Agen/ })).toBeTruthy();
  });
});
