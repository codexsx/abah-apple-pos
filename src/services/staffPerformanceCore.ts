export type StaffBatch = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Lord';

export interface StaffBatchResult {
  batch: StaffBatch;
  targetUnits: number;
  nextBatch: StaffBatch | null;
  nextBatchUnits: number | null;
  progressPercent: number;
}

export interface StaffLevelResult {
  level: number;
  xp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
}

const STORE_MONTHLY_UNIT_TARGET = 500;
const MINIMUM_TARGET_STAFF = 5;

const BATCHES: Array<{
  batch: StaffBatch;
  minRatio: number;
}> = [
  { batch: 'Bronze', minRatio: 0 },
  { batch: 'Silver', minRatio: 0.5 },
  { batch: 'Gold', minRatio: 0.9 },
  { batch: 'Platinum', minRatio: 1.2 },
  { batch: 'Lord', minRatio: 1.6 },
];

export function getPerStaffMonthlyTarget(
  activeSalesStaff: number,
  storeTarget = STORE_MONTHLY_UNIT_TARGET,
): number {
  const staffCount = Math.max(MINIMUM_TARGET_STAFF, Math.floor(activeSalesStaff));
  return Math.ceil(storeTarget / staffCount);
}

function minUnitsForRatio(targetUnits: number, ratio: number): number {
  return Math.ceil(targetUnits * ratio);
}

export function calculateStaffBatch(
  previousMonthUnits: number,
  activeSalesStaff: number,
): StaffBatchResult {
  const targetUnits = getPerStaffMonthlyTarget(activeSalesStaff);
  const units = Math.max(0, Math.floor(previousMonthUnits));
  let batchIndex = 0;

  BATCHES.forEach((entry, index) => {
    if (units >= minUnitsForRatio(targetUnits, entry.minRatio)) {
      batchIndex = index;
    }
  });

  const next = BATCHES[batchIndex + 1] ?? null;
  const nextBatchUnits = next ? minUnitsForRatio(targetUnits, next.minRatio) : null;
  const progressTarget = nextBatchUnits ?? minUnitsForRatio(targetUnits, BATCHES[batchIndex].minRatio);
  const progressPercent = progressTarget > 0
    ? Math.min(100, Math.round((units / progressTarget) * 100))
    : 100;

  return {
    batch: BATCHES[batchIndex].batch,
    targetUnits,
    nextBatch: next?.batch ?? null,
    nextBatchUnits,
    progressPercent,
  };
}

export function calculateStaffLevel(totalUnits: number): StaffLevelResult {
  const xp = Math.max(0, Math.floor(totalUnits)) * 10;
  const level = 1 + Math.floor(Math.sqrt(xp / 100));
  const currentLevelXp = Math.pow(level - 1, 2) * 100;
  const nextLevelXp = Math.pow(level, 2) * 100;
  const span = Math.max(1, nextLevelXp - currentLevelXp);
  const progressPercent = Math.min(100, Math.round(((xp - currentLevelXp) / span) * 100));

  return {
    level,
    xp,
    currentLevelXp,
    nextLevelXp,
    progressPercent,
  };
}
