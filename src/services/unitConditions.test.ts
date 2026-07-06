import { describe, expect, it } from 'vitest';

import { UNIT_CONDITION_OPTIONS } from '@/services/unitConditions';

describe('unit condition options', () => {
  it('includes simlock minus for every unit condition selector', () => {
    expect(UNIT_CONDITION_OPTIONS).toContain('Second Inter Simlock Minus');
  });

  it('keeps the existing operational condition labels available', () => {
    expect(UNIT_CONDITION_OPTIONS).toEqual(expect.arrayContaining([
      'Second iBox',
      'Second Bea Cukai',
      'Second Inter',
      'Second Inter Unlock',
      'Second Inter SimLock',
      'Second Inter Unlock Minus',
      'Second Ex-Inter',
      'Second Bid',
      'Baru iBox',
      'Baru Inter',
    ]));
  });
});
