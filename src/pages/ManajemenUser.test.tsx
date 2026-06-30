// Feature: user-management (Phase 9, task 6.5)
// Component tests for the "Manajemen User" page. The users service is mocked
// so the page's data-loading behavior (loading -> loaded, and error -> retry)
// and the create-user form validation are fully controllable. The page uses
// react-router's useNavigate, so renders are wrapped in <MemoryRouter>.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { listUsers, createUser } from '@/services/users';
import type { ManagedUser } from '@/services/users';

// ---- Mock the service layer ----------------------------------------------
vi.mock('@/services/users');

// Import after the mock is registered.
import ManajemenUser from './ManajemenUser';

// ---- Fixtures --------------------------------------------------------------

function makeUser(overrides: Partial<ManagedUser> = {}): ManagedUser {
  return {
    id: '1',
    username: 'kasir1',
    name: 'Kasir Satu',
    role: 'KASIR',
    permissions: {},
    avatar_url: null,
    ...overrides,
  } as ManagedUser;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ManajemenUser />
    </MemoryRouter>,
  );
}

describe('ManajemenUser page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the user list once it resolves (loaded state)', async () => {
    vi.mocked(listUsers).mockResolvedValue([makeUser()]);

    renderPage();

    // The user's display name and the "@username" handle appear after loading.
    expect(await screen.findByText('Kasir Satu')).toBeInTheDocument();
    expect(screen.getByText('@kasir1')).toBeInTheDocument();

    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it('does not call createUser and surfaces a validation error on empty submit', async () => {
    vi.mocked(listUsers).mockResolvedValue([makeUser()]);

    const user = userEvent.setup();
    renderPage();

    // Wait for the page to finish loading.
    await screen.findByText('Kasir Satu');

    // Open the create dialog via the header "Tambah User" button. Before the
    // dialog opens there is only one such button (the header action).
    await user.click(screen.getByRole('button', { name: /Tambah User/i }));

    // The dialog form should now be rendered: confirm by finding form controls.
    // There are role buttons (KASIR/MANAJER/TEKNISI) and permission checkboxes.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Penjualan')).toBeInTheDocument();

    // Submit the dialog without filling the username (the create submit button
    // is the "Tambah User" button inside the dialog).
    const submit = within(dialog).getByRole('button', { name: /Tambah User/i });
    await user.click(submit);

    // A validation error appears and createUser is never called.
    expect(await within(dialog).findByText(/wajib/i)).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('shows an error with a retry button, then loads after clicking "Coba lagi"', async () => {
    vi.mocked(listUsers)
      .mockRejectedValueOnce(new Error('Gagal memuat data user'))
      .mockResolvedValueOnce([]);

    const user = userEvent.setup();
    renderPage();

    // Error UI appears with the retry action.
    const retry = await screen.findByRole('button', { name: /Coba lagi/i });
    expect(retry).toBeInTheDocument();

    await user.click(retry);

    // After the successful retry the empty state renders.
    expect(await screen.findByText('Belum ada user')).toBeInTheDocument();

    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2));
  });
});
