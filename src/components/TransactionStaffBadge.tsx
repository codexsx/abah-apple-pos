import { UserRound } from 'lucide-react';
import {
  getTransactionStaffName,
  getTransactionStaffRole,
  type Transaction,
  type TransactionStaff,
} from '@/services/transactions';

interface Props {
  transaction?: Pick<Transaction, 'staff' | 'staff_id'>;
  staff?: TransactionStaff | null;
  prefix?: string;
}

export function TransactionStaffBadge({ transaction, staff, prefix = 'Input:' }: Props) {
  const staffSource = transaction ?? { staff, staff_id: null };
  const resolvedStaff = staff ?? transaction?.staff ?? null;
  const staffName = getTransactionStaffName({ ...staffSource, staff: resolvedStaff });
  const role = getTransactionStaffRole({ staff: resolvedStaff });

  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
      <UserRound size={12} className="shrink-0 text-slate-400" />
      <span className="truncate">{prefix} {staffName}</span>
      {role && (
        <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
          {role}
        </span>
      )}
    </div>
  );
}
