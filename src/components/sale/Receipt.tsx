// Feature: pos-finalization / print-nota
// Presentational printable receipt for a finalized Sales (Penjualan) transaction.
// No data fetching — renders a captured ReceiptData snapshot only.

import type { ReceiptData } from '@/services/receipt';

export type { ReceiptData } from '@/services/receipt';

/**
 * Format an integer IDR amount as a monetary value with exactly two decimal
 * places using the id-ID convention (e.g. 12000000 -> "Rp 12.000.000,00").
 */
const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(amount: number): string {
  return idrFormatter.format(amount);
}

/**
 * Format an ISO timestamp into a calendar date and time-of-day to the minute
 * using the id-ID locale.
 */
const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatTimestamp(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

function formatShortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function Separator(): React.JSX.Element {
  return <div className="my-2 border-b-2 border-dashed border-gray-400" aria-hidden="true" />;
}

export function Receipt({ data }: { data: ReceiptData }): React.JSX.Element {
  const {
    transactionId,
    units,
    items,
    bonuses,
    warranty,
    customerName,
    customerPhone,
    totals,
    payment,
    finalizedAt,
  } = data;

  const hasCustomer = Boolean(customerName) || Boolean(customerPhone);

  return (
    <div className="receipt-print-area mx-auto max-w-sm bg-white p-6 text-sm text-black">
      <header className="mb-3 text-center">
        <h2 className="text-lg font-bold uppercase tracking-wide">DR HTM</h2>
        <p className="text-[11px] text-gray-600">Second-Hand iPhone Specialist</p>

        <Separator />

        <p className="text-xs font-semibold">STRUK PENJUALAN</p>
        <p className="text-xs text-gray-600">{formatTimestamp(finalizedAt)}</p>
        {transactionId && (
          <p className="text-[10px] text-gray-500 mt-1">No. {formatShortId(transactionId)}</p>
        )}
      </header>

      <Separator />

      {hasCustomer && (
        <section className="mb-3">
          <p className="text-xs font-semibold mb-1">Pelanggan</p>
          {customerName && (
            <p>
              <span className="font-medium">Nama:</span> {customerName}
            </p>
          )}
          {customerPhone && (
            <p>
              <span className="font-medium">Telepon:</span> {customerPhone}
            </p>
          )}
          <Separator />
        </section>
      )}

      <section className="mb-3">
        <p className="text-xs font-semibold mb-2">Unit</p>
        <ul className="space-y-3">
          {units.map((unit, index) => (
            <li key={`${unit.imei || unit.model}-${index}`} className="text-xs">
              <div className="flex justify-between">
                <span className="font-medium">{unit.model}</span>
                <span className="font-medium">{formatMoney(unit.sellingPrice)}</span>
              </div>
              <div className="text-gray-700">
                {unit.capacity} • {unit.condition} • {unit.color}
              </div>
              {unit.imei && <div className="font-mono text-gray-600">IMEI: {unit.imei}</div>}
              {unit.batteryHealth !== undefined && unit.batteryHealth > 0 && (
                <div className="text-gray-600">BH: {unit.batteryHealth}%</div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {items.length > 0 && (
        <section className="mb-3">
          <Separator />
          <p className="text-xs font-semibold mb-2">Item Tambahan</p>
          <ul className="space-y-1">
            {items.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="flex justify-between text-xs"
              >
                <span>{item.name}</span>
                <span>{formatMoney(item.price)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bonuses.length > 0 && (
        <section className="mb-3">
          <Separator />
          <p className="text-xs font-semibold mb-2">Bonus</p>
          <ul className="space-y-1">
            {bonuses.map((bonus, index) => (
              <li key={`${bonus.name}-${index}`} className="text-xs">
                • {bonus.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {warranty && (
        <section className="mb-3">
          <Separator />
          <p className="text-xs">
            <span className="font-medium">Garansi:</span> {warranty}
          </p>
        </section>
      )}

      <Separator />

      <section className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatMoney(totals.subtotal)}</span>
        </div>
        {totals.discount > 0 && (
          <div className="flex justify-between">
            <span>Diskon</span>
            <span>−{formatMoney(totals.discount)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-sm">
          <span>Total Transaksi</span>
          <span>{formatMoney(totals.transactionTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tunai</span>
          <span>{formatMoney(payment.cash)}</span>
        </div>
        <div className="flex justify-between">
          <span>Transfer</span>
          <span>{formatMoney(payment.transfer)}</span>
        </div>
        <div className="flex justify-between font-semibold text-sm">
          <span>Kembalian</span>
          <span>{formatMoney(totals.changeDue)}</span>
        </div>
      </section>

      <Separator />

      <footer className="text-center text-[11px] text-gray-600 space-y-1">
        <p className="font-medium">Terima kasih atas kunjungannya</p>
        <p>Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.</p>
      </footer>
    </div>
  );
}
