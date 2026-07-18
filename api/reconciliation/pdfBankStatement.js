const MAX_ENTRIES = 500;

function clampText(value, maxLength) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function isoDate(value, fallbackDate) {
  const raw = clampText(value, 40);
  const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const local = raw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (local) {
    const year = local[3].length === 2 ? `20${local[3]}` : local[3];
    return `${year}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  }

  return fallbackDate;
}

function amount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.abs(parsed));
}

function direction(value) {
  return String(value ?? '').toLowerCase() === 'out' ? 'out' : 'in';
}

export function parseAiBankStatement(payload, input) {
  const rawEntries = Array.isArray(payload?.entries) ? payload.entries : [];
  const entries = rawEntries
    .slice(0, MAX_ENTRIES)
    .map((entry, index) => {
      const parsedAmount = amount(entry?.amount);
      if (parsedAmount <= 0) return null;

      const description = clampText(entry?.description, 360);
      const reference = clampText(entry?.reference, 120);
      return {
        id: `bank:${input.fileName}:${index + 1}`,
        source: 'bank',
        date: isoDate(entry?.date, input.defaultDate),
        direction: direction(entry?.direction),
        amount: parsedAmount,
        accountName: clampText(entry?.accountName, 120) || input.accountName || 'Mutasi Bank',
        description: description || reference || `Mutasi bank baris ${index + 1}`,
        reference: reference || undefined,
      };
    })
    .filter(Boolean);

  const warnings = Array.isArray(payload?.warnings)
    ? payload.warnings.map((item) => clampText(item, 240)).filter(Boolean).slice(0, 20)
    : [];

  if (entries.length === 0) {
    warnings.unshift('Tidak ada transaksi valid yang bisa dibaca dari PDF mutasi.');
  }

  return { entries, warnings };
}
