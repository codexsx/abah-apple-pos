export type ReconciliationSource = 'webapp' | 'manual' | 'bank';

export type MoneyDirection = 'in' | 'out';

export type ReconciliationIssueKind =
  | 'missing_in_webapp'
  | 'missing_in_manual'
  | 'missing_in_bank'
  | 'amount_mismatch'
  | 'account_mismatch'
  | 'possible_bank_fee'
  | 'possible_duplicate';

export type ReconciliationSeverity = 'info' | 'warning' | 'critical';

export interface ReconciliationEntry {
  id: string;
  source: ReconciliationSource;
  date: string;
  direction: MoneyDirection;
  amount: number;
  accountName: string;
  accountType?: string;
  description: string;
  reference?: string;
  staffName?: string;
  transactionType?: string;
}

export interface ReconciliationPair {
  id: string;
  leftId: string;
  rightId: string;
  leftSource: ReconciliationSource;
  rightSource: ReconciliationSource;
  confidence: number;
  status: 'exact' | 'possible';
  amountDifference: number;
  dateDifferenceDays: number;
  accountMatches: boolean;
  reasons: string[];
}

export interface ReconciliationIssue {
  id: string;
  kind: ReconciliationIssueKind;
  severity: ReconciliationSeverity;
  title: string;
  description: string;
  amountImpact: number;
  suggestedAction: string;
  entries: ReconciliationEntry[];
}

export interface SourceTotals {
  count: number;
  moneyIn: number;
  moneyOut: number;
  net: number;
}

export interface ReconciliationSummary {
  webapp: SourceTotals;
  manual: SourceTotals;
  bank: SourceTotals;
  webappVsManualNet: number;
  webappVsBankNet: number;
  manualVsBankNet: number;
  issueCount: number;
  criticalCount: number;
}

export interface ReconciliationResult {
  summary: ReconciliationSummary;
  pairs: ReconciliationPair[];
  issues: ReconciliationIssue[];
  unmatched: Record<ReconciliationSource, ReconciliationEntry[]>;
}

export interface BuildReconciliationInput {
  webappEntries: ReconciliationEntry[];
  manualEntries: ReconciliationEntry[];
  bankEntries: ReconciliationEntry[];
  amountTolerance?: number;
  bankFeeTolerance?: number;
  dateToleranceDays?: number;
}

interface CandidatePair {
  left: ReconciliationEntry;
  right: ReconciliationEntry;
  pair: ReconciliationPair;
}

const DEFAULT_AMOUNT_TOLERANCE = 1000;
const DEFAULT_BANK_FEE_TOLERANCE = 50000;
const DEFAULT_DATE_TOLERANCE_DAYS = 1;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeText(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAccount(text: string | null | undefined): string {
  return normalizeText(text)
    .replace(/\b(rekening|akun|bank|cash|kas|toko)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDateMs(date: string): number {
  const ms = Date.parse(date.includes('T') ? date : `${date}T00:00:00`);
  return Number.isNaN(ms) ? 0 : ms;
}

function dateDifferenceDays(a: string, b: string): number {
  const diff = Math.abs(parseDateMs(a) - parseDateMs(b));
  if (diff === 0) return 0;
  return Math.floor(diff / 86_400_000);
}

function accountMatches(a: ReconciliationEntry, b: ReconciliationEntry): boolean {
  const left = normalizeAccount(a.accountName);
  const right = normalizeAccount(b.accountName);
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

function tokenOverlap(a: string, b: string): number {
  const left = new Set(normalizeText(a).split(' ').filter((part) => part.length >= 3));
  const right = new Set(normalizeText(b).split(' ').filter((part) => part.length >= 3));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  left.forEach((token) => {
    if (right.has(token)) shared += 1;
  });
  return shared / Math.max(left.size, right.size);
}

function sourceTotals(entries: ReconciliationEntry[]): SourceTotals {
  return entries.reduce<SourceTotals>(
    (totals, entry) => {
      const amount = Math.max(0, Math.round(entry.amount));
      totals.count += 1;
      if (entry.direction === 'in') totals.moneyIn += amount;
      else totals.moneyOut += amount;
      totals.net = totals.moneyIn - totals.moneyOut;
      return totals;
    },
    { count: 0, moneyIn: 0, moneyOut: 0, net: 0 },
  );
}

function buildPairCandidates(input: {
  leftEntries: ReconciliationEntry[];
  rightEntries: ReconciliationEntry[];
  rightSource: ReconciliationSource;
  amountTolerance: number;
  bankFeeTolerance: number;
  dateToleranceDays: number;
}): CandidatePair[] {
  const candidates: CandidatePair[] = [];
  const maxAmountTolerance = Math.max(input.amountTolerance, input.bankFeeTolerance);

  for (const left of input.leftEntries) {
    for (const right of input.rightEntries) {
      if (left.direction !== right.direction) continue;

      const amountDifference = Math.abs(left.amount - right.amount);
      const dayDifference = dateDifferenceDays(left.date, right.date);
      const sameAccount = accountMatches(left, right);
      const overlap = tokenOverlap(
        `${left.description} ${left.reference ?? ''}`,
        `${right.description} ${right.reference ?? ''}`,
      );

      const amountCandidate =
        amountDifference <= maxAmountTolerance ||
        amountDifference <= Math.max(10000, Math.round(left.amount * 0.02));
      const dateCandidate = dayDifference <= input.dateToleranceDays;
      const textCandidate = overlap >= 0.35;

      if (!amountCandidate && !textCandidate) continue;
      if (!dateCandidate && !textCandidate) continue;

      let confidence = 20;
      const reasons: string[] = [];

      if (amountDifference === 0) {
        confidence += 36;
        reasons.push('Nominal sama');
      } else if (amountDifference <= input.amountTolerance) {
        confidence += 28;
        reasons.push('Nominal beda tipis');
      } else if (amountDifference <= input.bankFeeTolerance) {
        confidence += 20;
        reasons.push('Selisih masih dalam toleransi biaya admin');
      } else {
        confidence += 8;
        reasons.push('Nominal mirip, perlu cek manual');
      }

      if (dayDifference === 0) {
        confidence += 22;
        reasons.push('Tanggal sama');
      } else if (dayDifference <= input.dateToleranceDays) {
        confidence += 12;
        reasons.push(`Tanggal beda ${dayDifference} hari`);
      }

      if (sameAccount) {
        confidence += 14;
        reasons.push('Akun cocok');
      } else {
        confidence -= 12;
        reasons.push('Akun/metode tidak sama');
      }

      if (overlap > 0) {
        confidence += Math.round(overlap * 12);
        reasons.push('Deskripsi mirip');
      }

      const status =
        amountDifference === 0 && dayDifference === 0 && sameAccount ? 'exact' : 'possible';

      candidates.push({
        left,
        right,
        pair: {
          id: `${left.source}:${left.id}->${input.rightSource}:${right.id}`,
          leftId: left.id,
          rightId: right.id,
          leftSource: left.source,
          rightSource: input.rightSource,
          confidence: clamp(confidence, 1, 100),
          status,
          amountDifference,
          dateDifferenceDays: dayDifference,
          accountMatches: sameAccount,
          reasons,
        },
      });
    }
  }

  return candidates.sort((a, b) => b.pair.confidence - a.pair.confidence);
}

function greedyPairs(candidates: CandidatePair[]): ReconciliationPair[] {
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();
  const pairs: ReconciliationPair[] = [];

  for (const candidate of candidates) {
    if (usedLeft.has(candidate.left.id) || usedRight.has(candidate.right.id)) continue;
    usedLeft.add(candidate.left.id);
    usedRight.add(candidate.right.id);
    pairs.push(candidate.pair);
  }

  return pairs;
}

function issueId(prefix: string, entry: ReconciliationEntry): string {
  return `${prefix}:${entry.source}:${entry.id}`;
}

function entryLabel(entry: ReconciliationEntry): string {
  const parts = [
    entry.transactionType,
    entry.description,
    entry.accountName,
    entry.reference,
  ].filter(Boolean);
  return parts.join(' - ') || entry.id;
}

function makeMissingIssue(
  kind: Extract<
    ReconciliationIssueKind,
    'missing_in_webapp' | 'missing_in_manual' | 'missing_in_bank'
  >,
  entry: ReconciliationEntry,
): ReconciliationIssue {
  if (kind === 'missing_in_webapp') {
    return {
      id: issueId(kind, entry),
      kind,
      severity: 'critical',
      title: 'Ada data real yang belum tercatat di webapp',
      description: `${entry.source === 'bank' ? 'Mutasi bank' : 'Pendataan manual'} ${entryLabel(entry)} belum punya pasangan di webapp.`,
      amountImpact: entry.amount,
      suggestedAction: 'Cek apakah transaksi lupa diinput, salah tanggal, atau masuk akun berbeda.',
      entries: [entry],
    };
  }

  if (kind === 'missing_in_manual') {
    return {
      id: issueId(kind, entry),
      kind,
      severity: 'warning',
      title: 'Transaksi webapp tidak ada di pendataan manual',
      description: `${entryLabel(entry)} tercatat di webapp, tapi belum ditemukan di data manual.`,
      amountImpact: entry.amount,
      suggestedAction: 'Cek catatan lapangan atau minta staff melengkapi pendataan manual.',
      entries: [entry],
    };
  }

  return {
    id: issueId(kind, entry),
    kind,
    severity: 'warning',
    title: 'Transaksi webapp belum terlihat di mutasi bank',
    description: `${entryLabel(entry)} tercatat di webapp, tapi belum ditemukan di mutasi bank.`,
    amountImpact: entry.amount,
    suggestedAction: 'Cek pending settlement, salah akun bank, atau tanggal cair berbeda.',
    entries: [entry],
  };
}

function buildPairIssue(
  pair: ReconciliationPair,
  left: ReconciliationEntry,
  right: ReconciliationEntry,
  bankFeeTolerance: number,
): ReconciliationIssue | null {
  if (pair.amountDifference === 0 && pair.accountMatches) return null;

  if (
    pair.rightSource === 'bank' &&
    pair.amountDifference > 0 &&
    pair.amountDifference <= bankFeeTolerance
  ) {
    return {
      id: `fee:${pair.id}`,
      kind: 'possible_bank_fee',
      severity: 'info',
      title: 'Kemungkinan biaya admin / settlement',
      description: `${entryLabel(left)} cocok dengan mutasi bank, tapi ada selisih ${pair.amountDifference.toLocaleString('id-ID')}.`,
      amountImpact: pair.amountDifference,
      suggestedAction: 'Jika benar potongan bank/QRIS, catat sebagai penyesuaian biaya admin saat closing.',
      entries: [left, right],
    };
  }

  if (pair.amountDifference > 0) {
    return {
      id: `amount:${pair.id}`,
      kind: 'amount_mismatch',
      severity: 'critical',
      title: 'Nominal berbeda',
      description: `${entryLabel(left)} punya pasangan, tapi nominalnya berbeda dengan ${right.source}.`,
      amountImpact: pair.amountDifference,
      suggestedAction: 'Cek typo nominal, diskon, biaya admin, atau transaksi yang digabung settlement.',
      entries: [left, right],
    };
  }

  if (!pair.accountMatches) {
    return {
      id: `account:${pair.id}`,
      kind: 'account_mismatch',
      severity: 'warning',
      title: 'Akun/metode pembayaran berbeda',
      description: `${entryLabel(left)} cocok nominalnya, tapi akun/metode tidak sama dengan ${right.source}.`,
      amountImpact: left.amount,
      suggestedAction: 'Cek apakah transaksi salah pilih cash/bank di webapp.',
      entries: [left, right],
    };
  }

  return null;
}

function duplicateIssues(entries: ReconciliationEntry[]): ReconciliationIssue[] {
  const groups = new Map<string, ReconciliationEntry[]>();
  entries.forEach((entry) => {
    const key = [
      entry.source,
      entry.date,
      entry.direction,
      entry.amount,
      normalizeAccount(entry.accountName),
      normalizeText(entry.description),
    ].join('|');
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  });

  return Array.from(groups.values())
    .filter((group) => group.length > 1)
    .map((group) => ({
      id: `duplicate:${group[0].source}:${group.map((entry) => entry.id).join(',')}`,
      kind: 'possible_duplicate',
      severity: 'warning',
      title: 'Kemungkinan input dobel',
      description: `${group.length} baris ${group[0].source} punya tanggal, akun, nominal, dan deskripsi yang sama.`,
      amountImpact: group.reduce((sum, entry) => sum + entry.amount, 0),
      suggestedAction: 'Cek apakah ini transaksi berbeda yang kebetulan sama atau input duplikat.',
      entries: group,
    }));
}

function pairMap(
  pairs: ReconciliationPair[],
  source: ReconciliationSource,
): Map<string, ReconciliationPair> {
  const map = new Map<string, ReconciliationPair>();
  pairs.forEach((pair) => {
    if (pair.leftSource === source) map.set(pair.leftId, pair);
    if (pair.rightSource === source) map.set(pair.rightId, pair);
  });
  return map;
}

export function buildReconciliation(
  input: BuildReconciliationInput,
): ReconciliationResult {
  const amountTolerance = input.amountTolerance ?? DEFAULT_AMOUNT_TOLERANCE;
  const bankFeeTolerance = input.bankFeeTolerance ?? DEFAULT_BANK_FEE_TOLERANCE;
  const dateToleranceDays = input.dateToleranceDays ?? DEFAULT_DATE_TOLERANCE_DAYS;

  const webappManualPairs = greedyPairs(
    buildPairCandidates({
      leftEntries: input.webappEntries,
      rightEntries: input.manualEntries,
      rightSource: 'manual',
      amountTolerance,
      bankFeeTolerance,
      dateToleranceDays,
    }),
  );
  const webappBankPairs = greedyPairs(
    buildPairCandidates({
      leftEntries: input.webappEntries,
      rightEntries: input.bankEntries,
      rightSource: 'bank',
      amountTolerance,
      bankFeeTolerance,
      dateToleranceDays,
    }),
  );
  const manualBankPairs = greedyPairs(
    buildPairCandidates({
      leftEntries: input.manualEntries,
      rightEntries: input.bankEntries,
      rightSource: 'bank',
      amountTolerance,
      bankFeeTolerance,
      dateToleranceDays,
    }),
  );

  const allPairs = [...webappManualPairs, ...webappBankPairs, ...manualBankPairs];
  const manualPairByWebapp = pairMap(webappManualPairs, 'webapp');
  const bankPairByWebapp = pairMap(webappBankPairs, 'webapp');
  const webappPairByManual = pairMap(webappManualPairs, 'manual');
  const webappPairByBank = pairMap(webappBankPairs, 'bank');

  const entriesById = new Map<string, ReconciliationEntry>();
  [...input.webappEntries, ...input.manualEntries, ...input.bankEntries].forEach((entry) => {
    entriesById.set(`${entry.source}:${entry.id}`, entry);
  });

  const issues: ReconciliationIssue[] = [];

  input.webappEntries.forEach((entry) => {
    if (input.manualEntries.length > 0 && !manualPairByWebapp.has(entry.id)) {
      issues.push(makeMissingIssue('missing_in_manual', entry));
    }
    if (input.bankEntries.length > 0 && !bankPairByWebapp.has(entry.id)) {
      issues.push(makeMissingIssue('missing_in_bank', entry));
    }
  });

  input.manualEntries.forEach((entry) => {
    if (!webappPairByManual.has(entry.id)) {
      issues.push(makeMissingIssue('missing_in_webapp', entry));
    }
  });

  input.bankEntries.forEach((entry) => {
    if (!webappPairByBank.has(entry.id)) {
      issues.push(makeMissingIssue('missing_in_webapp', entry));
    }
  });

  [...webappManualPairs, ...webappBankPairs].forEach((pair) => {
    const left = entriesById.get(`${pair.leftSource}:${pair.leftId}`);
    const right = entriesById.get(`${pair.rightSource}:${pair.rightId}`);
    if (!left || !right) return;
    const issue = buildPairIssue(pair, left, right, bankFeeTolerance);
    if (issue) issues.push(issue);
  });

  issues.push(
    ...duplicateIssues(input.webappEntries),
    ...duplicateIssues(input.manualEntries),
    ...duplicateIssues(input.bankEntries),
  );

  const matchedBySource: Record<ReconciliationSource, Set<string>> = {
    webapp: new Set(),
    manual: new Set(),
    bank: new Set(),
  };
  allPairs.forEach((pair) => {
    matchedBySource[pair.leftSource].add(pair.leftId);
    matchedBySource[pair.rightSource].add(pair.rightId);
  });

  const webapp = sourceTotals(input.webappEntries);
  const manual = sourceTotals(input.manualEntries);
  const bank = sourceTotals(input.bankEntries);
  const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;

  return {
    summary: {
      webapp,
      manual,
      bank,
      webappVsManualNet: webapp.net - manual.net,
      webappVsBankNet: webapp.net - bank.net,
      manualVsBankNet: manual.net - bank.net,
      issueCount: issues.length,
      criticalCount,
    },
    pairs: allPairs,
    issues: issues.sort((a, b) => {
      const severityRank: Record<ReconciliationSeverity, number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };
      return severityRank[a.severity] - severityRank[b.severity] || b.amountImpact - a.amountImpact;
    }),
    unmatched: {
      webapp: input.webappEntries.filter((entry) => !matchedBySource.webapp.has(entry.id)),
      manual: input.manualEntries.filter((entry) => !matchedBySource.manual.has(entry.id)),
      bank: input.bankEntries.filter((entry) => !matchedBySource.bank.has(entry.id)),
    },
  };
}

export function compactReconciliationForAi(result: ReconciliationResult): unknown {
  return {
    summary: result.summary,
    issues: result.issues.slice(0, 40).map((issue) => ({
      kind: issue.kind,
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      amountImpact: issue.amountImpact,
      suggestedAction: issue.suggestedAction,
      entries: issue.entries.map((entry) => ({
        source: entry.source,
        date: entry.date,
        direction: entry.direction,
        amount: entry.amount,
        accountName: entry.accountName,
        description: entry.description,
        reference: entry.reference,
        staffName: entry.staffName,
        transactionType: entry.transactionType,
      })),
    })),
    possibleMatches: result.pairs
      .filter((pair) => pair.status === 'possible')
      .slice(0, 25)
      .map((pair) => ({
        leftSource: pair.leftSource,
        rightSource: pair.rightSource,
        confidence: pair.confidence,
        amountDifference: pair.amountDifference,
        dateDifferenceDays: pair.dateDifferenceDays,
        accountMatches: pair.accountMatches,
        reasons: pair.reasons,
      })),
  };
}
