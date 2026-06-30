import { supabase } from '@/lib/supabase';
import {
  calculateStaffBatch,
  calculateStaffLevel,
  type StaffBatch,
} from '@/services/staffPerformanceCore';

export interface StaffPerformanceRpcRow {
  staff_id: string;
  staff_name: string;
  role: string;
  avatar_url: string | null;
  previous_month_units: number;
  current_month_units: number;
  lifetime_units: number;
  active_sales_staff: number;
}

export interface StaffPerformance extends StaffPerformanceRpcRow {
  batch: StaffBatch;
  targetUnits: number;
  nextBatch: StaffBatch | null;
  nextBatchUnits: number | null;
  batchProgressPercent: number;
  level: number;
  xp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  levelProgressPercent: number;
}

function toNumber(value: unknown): number {
  return Number(value) || 0;
}

export function enrichStaffPerformance(row: StaffPerformanceRpcRow): StaffPerformance {
  const previousMonthUnits = toNumber(row.previous_month_units);
  const currentMonthUnits = toNumber(row.current_month_units);
  const lifetimeUnits = toNumber(row.lifetime_units);
  const activeSalesStaff = toNumber(row.active_sales_staff);
  const batch = calculateStaffBatch(previousMonthUnits, activeSalesStaff);
  const level = calculateStaffLevel(lifetimeUnits);

  return {
    ...row,
    previous_month_units: previousMonthUnits,
    current_month_units: currentMonthUnits,
    lifetime_units: lifetimeUnits,
    active_sales_staff: activeSalesStaff,
    batch: batch.batch,
    targetUnits: batch.targetUnits,
    nextBatch: batch.nextBatch,
    nextBatchUnits: batch.nextBatchUnits,
    batchProgressPercent: batch.progressPercent,
    level: level.level,
    xp: level.xp,
    currentLevelXp: level.currentLevelXp,
    nextLevelXp: level.nextLevelXp,
    levelProgressPercent: level.progressPercent,
  };
}

async function callPerformanceRpc(name: string): Promise<StaffPerformance[]> {
  const { data, error } = await supabase.rpc(name);
  if (error) throw error;
  return ((data ?? []) as StaffPerformanceRpcRow[]).map(enrichStaffPerformance);
}

export async function getOwnStaffPerformance(): Promise<StaffPerformance | null> {
  const rows = await callPerformanceRpc('get_own_staff_performance');
  return rows[0] ?? null;
}

export async function getStaffPerformanceLeaderboard(): Promise<StaffPerformance[]> {
  return callPerformanceRpc('get_staff_performance_leaderboard');
}
