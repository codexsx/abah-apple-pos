import { describe, it, expect } from 'vitest';
import type { StockItem } from './stock';
import { STOCK_STATUSES } from './stockCore';
import {
  findDuplicateIMEIs,
  findInvalidStatuses,
  findMissingIMEIs,
  findNegativeCounts,
  runStockIntegrityCheck,
} from './stockIntegrity';

function makeItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: 'u1',
    model: 'iPhone 13',
    capacity: '128GB',
    condition: 'Second',
    color: 'Midnight',
    imei: '352461789012341',
    has_imei: true,
    status: 'READY',
    count: 1,
    price: 7_000_000,
    cost_price: 5_500_000,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('findDuplicateIMEIs', () => {
  it('returns empty when all IMEIs are unique', () => {
    const items = [
      makeItem({ id: 'a', imei: '111' }),
      makeItem({ id: 'b', imei: '222' }),
    ];
    expect(findDuplicateIMEIs(items)).toEqual([]);
  });

  it('detects duplicate IMEIs and lists the affected items', () => {
    const items = [
      makeItem({ id: 'a', imei: '111' }),
      makeItem({ id: 'b', imei: '111' }),
      makeItem({ id: 'c', imei: '222' }),
    ];
    const result = findDuplicateIMEIs(items);
    expect(result).toHaveLength(1);
    expect(result[0].imei).toBe('111');
    expect(result[0].count).toBe(2);
    expect(result[0].items.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('ignores rows without IMEI', () => {
    const items = [
      makeItem({ id: 'a', imei: null, has_imei: false }),
      makeItem({ id: 'b', imei: null, has_imei: false }),
    ];
    expect(findDuplicateIMEIs(items)).toEqual([]);
  });
});

describe('findInvalidStatuses', () => {
  it('returns empty when all statuses are canonical', () => {
    const items = [makeItem(), makeItem({ id: 'b', status: 'SERVIS' })];
    expect(findInvalidStatuses(items, STOCK_STATUSES)).toEqual([]);
  });

  it('flags statuses outside the canonical set', () => {
    const items = [
      makeItem(),
      makeItem({ id: 'b', status: 'HILANG' as StockItem['status'] }),
    ];
    const result = findInvalidStatuses(items, STOCK_STATUSES);
    expect(result).toHaveLength(1);
    expect(result[0].item.id).toBe('b');
    expect(result[0].type).toBe('invalid-status');
  });
});

describe('findMissingIMEIs', () => {
  it('flags rows with has_imei true but empty IMEI', () => {
    const items = [makeItem({ id: 'a', imei: null, has_imei: true })];
    const result = findMissingIMEIs(items);
    expect(result).toHaveLength(1);
    expect(result[0].item.id).toBe('a');
  });

  it('ignores rows explicitly without IMEI', () => {
    const items = [makeItem({ id: 'a', imei: null, has_imei: false })];
    expect(findMissingIMEIs(items)).toEqual([]);
  });
});

describe('findNegativeCounts', () => {
  it('flags negative counts', () => {
    const items = [makeItem({ id: 'a', count: -1 })];
    const result = findNegativeCounts(items);
    expect(result).toHaveLength(1);
    expect(result[0].item.id).toBe('a');
  });

  it('ignores zero and positive counts', () => {
    const items = [
      makeItem({ id: 'a', count: 0 }),
      makeItem({ id: 'b', count: 5 }),
    ];
    expect(findNegativeCounts(items)).toEqual([]);
  });
});

describe('runStockIntegrityCheck', () => {
  it('returns total scanned and aggregates all issue types', () => {
    const items = [
      makeItem({ id: 'a', imei: '111' }),
      makeItem({ id: 'b', imei: '111' }),
      makeItem({ id: 'c', imei: '222', status: 'UNKNOWN' as StockItem['status'] }),
      makeItem({ id: 'd', imei: null, has_imei: true }),
      makeItem({ id: 'e', imei: '444', count: -2 }),
      makeItem({ id: 'f', imei: '333' }),
    ];

    const result = runStockIntegrityCheck(items, STOCK_STATUSES);
    expect(result.totalScanned).toBe(6);
    expect(result.duplicateImeis).toHaveLength(1);
    expect(result.problematicUnits).toHaveLength(3);
  });
});
