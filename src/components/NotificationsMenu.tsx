import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Bell, AlertCircle, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { getNotificationsWithCount } from '@/services/notifications';
import type { NotificationItem } from '@/services/notificationsCore';

interface NotificationsMenuProps {
  className?: string;
}

type LoadState = 'loading' | 'error' | 'loaded';

const SEVERITY_ORDER: Record<NotificationItem['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_STYLES: Record<
  NotificationItem['severity'],
  { dot: string; icon: typeof Info }
> = {
  critical: { dot: 'text-rose-500', icon: AlertCircle },
  warning: { dot: 'text-amber-500', icon: AlertTriangle },
  info: { dot: 'text-blue-500', icon: Info },
};

/**
 * Self-contained notifications bell with a count badge and a popover panel
 * listing the current finance/stock/agent alerts (Phase 9, Req 7.x). UI in
 * Bahasa Indonesia. Loads once on mount and refetches when (re)opened.
 */
export default function NotificationsMenu({ className }: NotificationsMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [actionableCount, setActionableCount] = useState(0);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const result = await getNotificationsWithCount();
      setItems(result.items);
      setActionableCount(result.actionableCount);
      setState('loaded');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void load();
  };

  const handleSelect = (route: string) => {
    setOpen(false);
    navigate(route);
  };

  // Ordered copy: critical first, then warning, then info. Never mutates state.
  const sortedItems = [...items].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const triggerClasses =
    'relative hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shadow-sm' +
    (className ? ` ${className}` : '');

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className={triggerClasses} aria-label="Notifications">
          <Bell size={18} strokeWidth={2} />
          {actionableCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm"
              aria-label={`${actionableCount} notifikasi perlu tindakan`}
            >
              {actionableCount > 99 ? '99+' : actionableCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[340px] rounded-xl p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h4 className="text-[14px] font-semibold text-slate-900 font-body">
            Notifikasi
          </h4>
          {actionableCount > 0 && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600 font-body">
              {actionableCount} perlu tindakan
            </span>
          )}
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {state === 'loading' && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-[13px] text-slate-500 font-body">
              <RefreshCw size={15} className="animate-spin text-slate-400" />
              Memuat notifikasi...
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <p className="text-[13px] text-slate-500 font-body">
                Gagal memuat notifikasi.
              </p>
              <button
                onClick={() => void load()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <RefreshCw size={14} className="text-slate-400" />
                Coba lagi
              </button>
            </div>
          )}

          {state === 'loaded' && sortedItems.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Bell size={22} className="text-slate-300" />
              <p className="text-[13px] text-slate-500 font-body">
                Tidak ada notifikasi
              </p>
            </div>
          )}

          {state === 'loaded' && sortedItems.length > 0 && (
            <ul className="flex flex-col py-1">
              {sortedItems.map((item) => {
                const { dot, icon: SeverityIcon } = SEVERITY_STYLES[item.severity];
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => handleSelect(item.route)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                    >
                      <SeverityIcon
                        size={16}
                        strokeWidth={2}
                        className={`mt-0.5 shrink-0 ${dot}`}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[13px] font-semibold text-slate-900 font-body">
                          {item.title}
                        </span>
                        <span className="text-[12px] text-slate-500 font-body">
                          {item.detail}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
