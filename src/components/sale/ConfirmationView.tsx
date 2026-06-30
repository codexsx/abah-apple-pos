// Feature: pos-finalization / print-nota
// Modal/overlay shown after a successful sale persistence or when reprinting a
// receipt from Riwayat. Hosts the printable Receipt plus Print and Dismiss
// actions. Purely presentational: it renders the captured ReceiptData snapshot
// unchanged and never mutates it.

import { Receipt, type ReceiptData } from '@/components/sale/Receipt';
import { Button } from '@/components/ui/button';

export interface ConfirmationViewProps {
  /** Captured snapshot of the finalized sale (rendered unchanged). */
  receipt: ReceiptData;
  /** Triggers the browser print pipeline (wrapped in try/catch by caller). */
  onPrint: () => void;
  /** Dismisses the view and triggers the form reset in Penjualan. */
  onDismiss: () => void;
  /** Optional print error surfaced while keeping the view open. */
  printError?: string | null;
  /** Optional modal title (defaults to post-sale copy). */
  title?: string;
  /** Optional modal subtitle (defaults to post-sale copy). */
  subtitle?: string;
}

export function ConfirmationView({
  receipt,
  onPrint,
  onDismiss,
  printError,
  title = 'Penjualan Berhasil',
  subtitle = 'Transaksi telah tercatat. Cetak struk atau selesaikan penjualan.',
}: ConfirmationViewProps): React.JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-view-title"
      className="confirmation-view-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg">
        <header className="text-center">
          <h2
            id="confirmation-view-title"
            className="text-lg font-semibold leading-none"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </header>

        <div className="flex-1 overflow-y-auto rounded-md border bg-white">
          <Receipt data={receipt} />
        </div>

        {printError && (
          <p role="alert" className="text-sm text-destructive">
            {printError}
          </p>
        )}

        <footer className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onPrint}>
            Cetak
          </Button>
          <Button onClick={onDismiss}>Selesai</Button>
        </footer>
      </div>
    </div>
  );
}
