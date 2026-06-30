import type { Accessory } from '@/services/accessories';
import type { Sparepart } from '@/services/spareparts';
import type { StockItem } from '@/services/stock';

export interface DashboardInventorySummary {
  readyHpTotal: number;
  readyConditionRows: Array<[string, number]>;
  accessoryTotal: number;
  sparepartTotal: number;
}

function sumPositive(value: number | null | undefined): number {
  return Math.max(0, Number(value) || 0);
}

export function buildDashboardInventorySummary(
  stockItems: StockItem[],
  accessories: Accessory[],
  spareparts: Sparepart[],
): DashboardInventorySummary {
  const readyStock = stockItems.filter((item) => item.status === 'READY');
  const readyHpTotal = readyStock.reduce((sum, item) => sum + sumPositive(item.count), 0);

  const conditionMap = new Map<string, number>();
  readyStock.forEach((item) => {
    const key = item.condition?.trim() || 'Tanpa Kondisi';
    conditionMap.set(key, (conditionMap.get(key) ?? 0) + sumPositive(item.count));
  });

  const readyConditionRows = Array.from(conditionMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3);

  return {
    readyHpTotal,
    readyConditionRows,
    accessoryTotal: accessories.reduce((sum, item) => sum + sumPositive(item.stock), 0),
    sparepartTotal: spareparts.reduce((sum, item) => sum + sumPositive(item.stock), 0),
  };
}
