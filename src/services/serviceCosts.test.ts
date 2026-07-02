import { describe, expect, it } from 'vitest';

import {
  buildServiceCostPayload,
  validateServiceCostDraft,
} from './serviceCosts';

describe('service cost rules', () => {
  it('builds service cost from optional sparepart plus required wage', () => {
    expect(
      buildServiceCostPayload({
        sparePartCost: '120000',
        wageAmount: '50000',
      }),
    ).toEqual({
      sparePartCost: 120000,
      wageAmount: 50000,
      workCost: 50000,
      estimatedCost: 170000,
    });
  });

  it('allows empty sparepart cost but keeps wage mandatory', () => {
    expect(
      buildServiceCostPayload({
        sparePartCost: '',
        wageAmount: '75000',
      }),
    ).toMatchObject({
      sparePartCost: 0,
      wageAmount: 75000,
      workCost: 75000,
      estimatedCost: 75000,
    });
  });

  it('rejects service submit when wage is empty or zero', () => {
    expect(
      validateServiceCostDraft({
        sparePartCost: '120000',
        wageAmount: '',
      }),
    ).toEqual({
      ok: false,
      field: 'upah',
      message: 'Upah wajib diisi.',
    });

    expect(
      validateServiceCostDraft({
        sparePartCost: '',
        wageAmount: '0',
      }),
    ).toMatchObject({
      ok: false,
      field: 'upah',
    });
  });

  it('rejects a DP greater than the computed total estimate', () => {
    expect(
      validateServiceCostDraft({
        sparePartCost: '50000',
        wageAmount: '100000',
        dp: '200000',
      }),
    ).toEqual({
      ok: false,
      field: 'dp',
      message: 'DP tidak boleh melebihi estimasi total.',
    });
  });
});
