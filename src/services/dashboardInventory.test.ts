import { describe, expect, it } from 'vitest';
import type { Accessory } from '@/services/accessories';
import type { Sparepart } from '@/services/spareparts';
import type { StockItem } from '@/services/stock';
import { buildDashboardInventorySummary } from './dashboardInventory';

function stock(overrides: Partial<StockItem>): StockItem {
  return {
    id: 'stock-1',
    model: 'iPhone 11',
    capacity: '128GB',
    condition: 'Second Inter',
    color: 'Black',
    imei: null,
    has_imei: false,
    status: 'READY',
    count: 1,
    price: 0,
    cost_price: 0,
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    ...overrides,
  };
}

function accessory(overrides: Partial<Accessory>): Accessory {
  return {
    id: 'acc-1',
    name: 'Paperbag',
    category: 'paperbag',
    stock: 0,
    status: 'AMAN',
    min_stock: 0,
    price: 0,
    ...overrides,
  };
}

function sparepart(overrides: Partial<Sparepart>): Sparepart {
  return {
    id: 'part-1',
    name: 'LCD',
    compatible_type: 'iPhone 11',
    stock: 0,
    min_stock: 0,
    buy_price: 0,
    sell_price: 0,
    created_at: '2026-06-30T00:00:00.000Z',
    updated_at: '2026-06-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildDashboardInventorySummary', () => {
  it('counts only READY HP for dashboard stock total and condition rows', () => {
    const result = buildDashboardInventorySummary(
      [
        stock({ status: 'READY', condition: 'Second Inter Unlock', count: 10 }),
        stock({ status: 'SERVIS', condition: 'Second Ex-Inter', count: 2 }),
        stock({ status: 'TERJUAL', condition: 'Second iBox', count: 100 }),
      ],
      [accessory({ stock: 1300 })],
      [sparepart({ stock: 40 })],
    );

    expect(result.readyHpTotal).toBe(10);
    expect(result.readyConditionRows).toEqual([['Second Inter Unlock', 10]]);
    expect(result.accessoryTotal).toBe(1300);
    expect(result.sparepartTotal).toBe(40);
  });
});
