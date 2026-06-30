// Feature: transaction-account-integration
// Reusable, presentational account selector. The parent loads the active
// accounts (via getAccountPickerData) and passes them in; this component never
// fetches. It renders a labeled list of selectable accounts, optionally
// constrained to a single type, and reports the chosen account up via onChange.

import { Link } from 'react-router';
import { Banknote, Landmark, AlertCircle, Wallet } from 'lucide-react';
import { type AccountWithBalance } from '@/services/accounts';

export interface AccountPickerProps {
  /** Selected account id (null when nothing is chosen yet). */
  value: string | null;
  /** Called with the chosen account id and the full account object. */
  onChange: (accountId: string, account: AccountWithBalance) => void;
  /** Constrains the listed accounts to a single type when provided. */
  filterType?: 'Cash' | 'Bank';
  /** Field label shown above the selector. */
  label: string;
  /** Active accounts loaded by the parent (from getAccountPickerData). */
  accounts: AccountWithBalance[];
  /** Validation error text to display under the selector. */
  error?: string | null;
}

/** `Rp ` + grouped digits, matching the Phase 1 AkunKas convention. */
function formatRupiah(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + 'Rp ' + Math.abs(n).toLocaleString('id-ID');
}

export default function AccountPicker({
  value,
  onChange,
  filterType,
  label,
  accounts,
  error,
}: AccountPickerProps) {
  // Constrain to the requested type when a filter is supplied.
  const options = filterType
    ? accounts.filter((a) => a.type === filterType)
    : accounts;

  const emptyMessage = filterType
    ? `Belum ada akun ${filterType} aktif.`
    : 'Belum ada akun aktif.';

  return (
    <div>
      <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">
        {label}
      </span>

      {options.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
          <Wallet size={22} className="text-slate-300" />
          <p className="text-[12px] font-medium text-slate-500">{emptyMessage}</p>
          <Link
            to="/akun-kas"
            className="text-[12px] font-semibold text-teal-600 hover:text-teal-700 transition-colors"
          >
            Buat atau aktifkan akun di Akun &amp; Kas
          </Link>
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label={label}
          className="space-y-2"
        >
          {options.map((account) => {
            const Icon = account.type === 'Cash' ? Banknote : Landmark;
            const selected = account.id === value;
            return (
              <button
                key={account.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(account.id, account)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      account.type === 'Cash'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-teal-50 text-teal-600'
                    }`}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[13px] font-semibold truncate ${
                          selected ? 'text-teal-800' : 'text-slate-800'
                        }`}
                      >
                        {account.name}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          account.type === 'Cash'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-teal-50 text-teal-700'
                        }`}
                      >
                        {account.type}
                      </span>
                    </span>
                  </span>
                </span>
                <span
                  className={`shrink-0 font-mono text-[12px] font-semibold ${
                    account.is_overdraft ? 'text-rose-600' : 'text-slate-600'
                  }`}
                >
                  {formatRupiah(account.current_balance)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
