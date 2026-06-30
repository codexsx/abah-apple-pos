import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  getLoginAccounts: vi.fn(),
  getCompanyProfile: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signIn: mocks.signIn }),
}));

vi.mock('@/services/loginDirectory', () => ({
  getLoginAccounts: mocks.getLoginAccounts,
}));

vi.mock('@/services/companySettings', () => ({
  getCompanyProfile: mocks.getCompanyProfile,
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

import Login from './Login';

const loginAccounts = [
  {
    id: 'manager-id',
    name: 'Muhammad Damiri',
    role: 'MANAJER',
    initials: 'MD',
    username: 'muhammaddamiri01',
    avatar_url: 'https://cdn.test/manager.png',
  },
  {
    id: 'kasir-id',
    name: 'Zaida',
    role: 'KASIR',
    initials: 'ZA',
    username: 'zaida',
    avatar_url: null,
  },
];

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.signIn.mockReset();
  mocks.getLoginAccounts.mockReset();
  mocks.getCompanyProfile.mockReset();
  mocks.navigate.mockReset();

  mocks.getCompanyProfile.mockResolvedValue({
    id: 'company_profile',
    name: 'Abah Apple POS',
    logo_url: 'https://cdn.test/logo.gif',
    updated_at: null,
  });
  mocks.getLoginAccounts.mockResolvedValue(loginAccounts);
  mocks.signIn.mockResolvedValue(undefined);
});

describe('Login - demo credential exposure', () => {
  // Feature: phase0-critical-bugfixes, Requirement 3.1: no demo credentials rendered
  it('does not render the demo email credential', async () => {
    renderLogin();
    await screen.findAllByText('Muhammad Damiri');
    expect(screen.queryByText(/lutfi@drhtm\.com/i)).toBeNull();
  });

  it('does not render the demo password credential', async () => {
    renderLogin();
    await screen.findAllByText('Muhammad Damiri');
    expect(screen.queryByText(/password123/i)).toBeNull();
  });

  it('does not render any "default demo" hint text', async () => {
    renderLogin();
    await screen.findAllByText('Muhammad Damiri');
    expect(screen.queryByText(/default demo/i)).toBeNull();
  });
});

describe('Login - account directory flow', () => {
  it('renders company branding and registered account cards', async () => {
    renderLogin();

    expect(await screen.findAllByText('Abah Apple POS')).toHaveLength(2);
    expect(screen.getByRole('img', { name: /abah apple pos logo/i })).toHaveAttribute(
      'src',
      'https://cdn.test/logo.gif',
    );
    expect(screen.getAllByText('Muhammad Damiri')).toHaveLength(2);
    expect(screen.getByText('Zaida')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/username atau nama@email\.com/i)).toBeNull();
  });

  it('logs in with the selected account username and typed password', async () => {
    const user = userEvent.setup();
    renderLogin();

    await screen.findAllByText('Muhammad Damiri');
    await user.click(screen.getByRole('button', { name: /zaida/i }));
    await user.type(screen.getByLabelText(/password/i), 'secret-password');
    await user.click(screen.getByRole('button', { name: /^login/i }));

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith('zaida', 'secret-password');
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('keeps a manual identifier fallback when the public account directory fails', async () => {
    const user = userEvent.setup();
    mocks.getLoginAccounts.mockRejectedValueOnce(new Error('RLS denied'));
    renderLogin();

    const identifier = await screen.findByPlaceholderText(/username atau nama@email\.com/i);
    await user.type(identifier, 'manualstaff');
    await user.type(screen.getByLabelText(/password/i), 'secret-password');
    await user.click(screen.getByRole('button', { name: /^login/i }));

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith('manualstaff', 'secret-password');
    });
  });
});
