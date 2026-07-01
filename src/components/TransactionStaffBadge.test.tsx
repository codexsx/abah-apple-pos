import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransactionStaffBadge } from './TransactionStaffBadge';
import type { Transaction } from '@/services/transactions';

const baseTransaction: Transaction = {
  id: 'tx-1',
  type: 'Penjualan',
  description: 'Penjualan 1 unit',
  detail: 'iPhone 11',
  amount: 3_500_000,
  created_at: '2026-07-01T10:00:00+07:00',
};

describe('TransactionStaffBadge', () => {
  it('shows the staff name and role responsible for the input', () => {
    render(
      <TransactionStaffBadge
        transaction={{
          ...baseTransaction,
          staff_id: 'staff-1',
          staff: {
            id: 'staff-1',
            name: 'Regga Prayuda',
            role: 'KASIR',
          },
        }}
      />,
    );

    expect(screen.getByText('Input: Regga Prayuda')).toBeInTheDocument();
    expect(screen.getByText('KASIR')).toBeInTheDocument();
  });

  it('shows a fallback for old transactions without staff audit data', () => {
    render(<TransactionStaffBadge transaction={{ ...baseTransaction, staff_id: null, staff: null }} />);

    expect(screen.getByText('Input: Staff tidak tercatat')).toBeInTheDocument();
  });
});
