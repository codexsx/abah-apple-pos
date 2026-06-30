// Feature: transaction-account-integration
// Component tests for the reusable AccountPicker (task 4.2).
// Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.6

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import AccountPicker from './AccountPicker';
import { type AccountWithBalance } from '@/services/accounts';

// ---------- Fixtures ----------

/** Build a fake AccountWithBalance, overriding only the fields a test cares about. */
function makeAccount(overrides: Partial<AccountWithBalance> = {}): AccountWithBalance {
  return {
    id: 'acc-default',
    name: 'Default Account',
    type: 'Cash',
    opening_balance: 0,
    note: '',
    is_archived: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    current_balance: 0,
    is_overdraft: false,
    ...overrides,
  };
}

const cashAccount = makeAccount({
  id: 'cash-1',
  name: 'Kas Toko',
  type: 'Cash',
  current_balance: 150000,
});

const bankAccount = makeAccount({
  id: 'bank-1',
  name: 'BCA Operasional',
  type: 'Bank',
  current_balance: 2500000,
});

function renderPicker(props: Partial<React.ComponentProps<typeof AccountPicker>> = {}) {
  const onChange = props.onChange ?? vi.fn();
  const utils = render(
    <MemoryRouter>
      <AccountPicker
        value={props.value ?? null}
        onChange={onChange}
        label={props.label ?? 'Akun Tujuan'}
        accounts={props.accounts ?? [cashAccount, bankAccount]}
        filterType={props.filterType}
        error={props.error}
      />
    </MemoryRouter>,
  );
  return { ...utils, onChange };
}

describe('AccountPicker', () => {
  it('renders each account showing name, type, and formatted balance (Req 8.2)', () => {
    renderPicker();

    // Both accounts are present as radio options.
    const cashOption = screen.getByRole('radio', { name: /Kas Toko/ });
    const bankOption = screen.getByRole('radio', { name: /BCA Operasional/ });

    // Cash account: name, type badge, and formatted balance.
    expect(within(cashOption).getByText('Kas Toko')).toBeTruthy();
    expect(within(cashOption).getByText('Cash')).toBeTruthy();
    expect(within(cashOption).getByText('Rp 150.000')).toBeTruthy();

    // Bank account: name, type badge, and formatted balance.
    expect(within(bankOption).getByText('BCA Operasional')).toBeTruthy();
    expect(within(bankOption).getByText('Bank')).toBeTruthy();
    expect(within(bankOption).getByText('Rp 2.500.000')).toBeTruthy();
  });

  it('filterType="Cash" shows only Cash accounts (Req 8.4, 8.5)', () => {
    renderPicker({ filterType: 'Cash' });

    expect(screen.getByRole('radio', { name: /Kas Toko/ })).toBeTruthy();
    expect(screen.queryByText('BCA Operasional')).toBeNull();
  });

  it('filterType="Bank" shows only Bank accounts (Req 8.4, 8.5)', () => {
    renderPicker({ filterType: 'Bank' });

    expect(screen.getByRole('radio', { name: /BCA Operasional/ })).toBeTruthy();
    expect(screen.queryByText('Kas Toko')).toBeNull();
  });

  it('calls onChange with the selected account id and full account (Req 8.3)', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole('radio', { name: /BCA Operasional/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('bank-1', bankAccount);
  });

  it('renders the empty-state message and a link to /akun-kas when no accounts (Req 8.6)', () => {
    renderPicker({ accounts: [] });

    expect(screen.getByText('Belum ada akun aktif.')).toBeTruthy();
    const link = screen.getByRole('link', { name: /Akun & Kas/ });
    expect(link.getAttribute('href')).toBe('/akun-kas');
  });

  it('renders the empty-state when the filter matches no account (Req 8.6)', () => {
    // Only a Cash account exists, but we filter to Bank → empty filtered list.
    renderPicker({ accounts: [cashAccount], filterType: 'Bank' });

    expect(screen.getByText('Belum ada akun Bank aktif.')).toBeTruthy();
    const link = screen.getByRole('link', { name: /Akun & Kas/ });
    expect(link.getAttribute('href')).toBe('/akun-kas');
  });

  it('renders the error text when the error prop is provided', () => {
    renderPicker({ error: 'Pilih akun terlebih dahulu.' });

    expect(screen.getByText('Pilih akun terlebih dahulu.')).toBeTruthy();
  });
});
