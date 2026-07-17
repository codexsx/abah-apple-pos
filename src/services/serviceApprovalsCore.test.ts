import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeProposedModalPart,
  normalizeServiceEditRequest,
  summarizeServiceEditForApproval,
  SERVICE_EDITABLE_FIELDS,
} from './serviceApprovalsCore';
import type {
  ServiceChangeCurrentValue,
  ServiceUsageSnapshot,
} from './serviceApprovalsCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

function makeUsage(overrides: Partial<ServiceUsageSnapshot> = {}): ServiceUsageSnapshot {
  const quantity = overrides.quantity ?? 1;
  const unitCost = overrides.unit_cost ?? 100_000;
  return {
    id: overrides.id ?? 'aaaaaaaa-0000-4000-8000-000000000000',
    sparepart_id: overrides.sparepart_id ?? null,
    sparepart_name: overrides.sparepart_name ?? 'Spare Part Manual',
    quantity,
    unit_cost: unitCost,
    total_cost: quantity * unitCost,
    created_at: '2026-07-17T00:00:00Z',
  } as ServiceUsageSnapshot;
}

function makeCurrent(overrides: Partial<ServiceChangeCurrentValue> = {}): ServiceChangeCurrentValue {
  return {
    fields: {
      customer_name: 'Budi',
      phone_model: 'iPhone 11',
      capacity: '64GB',
      condition: 'Second Inter',
      color: 'Space Black',
      imei: '352345678901234',
      battery_health: 85,
      issue: 'LCD pecah',
      additional_note: '',
      technician: 'Rendi',
      wage_amount: 310_000,
      ...overrides.fields,
    },
    usages: overrides.usages ?? [makeUsage()],
  };
}

// ---------------------------------------------------------------------------
// Property 1: reason is mandatory
// ---------------------------------------------------------------------------

describe('Property 1: alasan wajib diisi', () => {
  // Feature: service-edit-approvals, Property 1
  it('blank reason selalu ditolak, reason valid diterima bila ada perubahan', () => {
    const blankArb = fc
      .array(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 5 })
      .map((c) => c.join(''));

    fc.assert(
      fc.property(blankArb, (reason) => {
        const result = normalizeServiceEditRequest({
          reason,
          current: makeCurrent(),
          proposed: { fields: { customer_name: 'Budi Baru' } },
        });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.message).toContain('Alasan');
      }),
      RUNS,
    );
  });

  it('reason lebih dari 500 karakter ditolak', () => {
    const result = normalizeServiceEditRequest({
      reason: 'x'.repeat(501),
      current: makeCurrent(),
      proposed: { fields: { customer_name: 'Budi Baru' } },
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 2: no-change is rejected; effective change is accepted
// ---------------------------------------------------------------------------

describe('Property 2: harus ada perubahan efektif', () => {
  // Feature: service-edit-approvals, Property 2
  it('proposed sama dengan current → ditolak', () => {
    const current = makeCurrent();
    const result = normalizeServiceEditRequest({
      reason: 'coba',
      current,
      proposed: {
        fields: { customer_name: 'Budi', wage_amount: 310_000 },
        usagesUpsert: [{ id: current.usages[0].id, quantity: 1, unit_cost: 100_000 }],
      },
    });
    expect(result).toEqual({ ok: false, message: 'Tidak ada perubahan untuk diajukan.' });
  });

  it('field arbitrary berbeda → diterima dan hanya field berubah yang masuk payload', () => {
    const nameArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim() !== 'Budi');

    fc.assert(
      fc.property(nameArb, (name) => {
        const result = normalizeServiceEditRequest({
          reason: 'koreksi nama',
          current: makeCurrent(),
          proposed: {
            fields: { customer_name: name, phone_model: 'iPhone 11' }, // phone_model sama → tidak masuk
          },
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(Object.keys(result.payload.fields)).toEqual(['customer_name']);
          expect(result.payload.fields.customer_name).toBe(name.trim());
        }
      }),
      RUNS,
    );
  });

  it('field non-whitelist selalu ditolak', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (k) => !(SERVICE_EDITABLE_FIELDS as readonly string[]).includes(k),
        ),
        (key) => {
          const result = normalizeServiceEditRequest({
            reason: 'coba',
            current: makeCurrent(),
            proposed: { fields: { [key]: 'x' } as never },
          });
          expect(result.ok).toBe(false);
          expect(result.ok === false && result.message).toContain('tidak boleh diedit');
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: usage edit rules
// ---------------------------------------------------------------------------

describe('Property 3: aturan baris sparepart', () => {
  // Feature: service-edit-approvals, Property 3
  const badQtyArb = fc.oneof(
    fc.integer({ min: -100, max: 0 }),
    fc.double({ min: 0.1, max: 0.9 }).filter((n) => !Number.isInteger(n)),
  );

  it('quantity < 1 ditolak', () => {
    fc.assert(
      fc.property(badQtyArb, (qty) => {
        const current = makeCurrent();
        const result = normalizeServiceEditRequest({
          reason: 'ubah qty',
          current,
          proposed: {
            usagesUpsert: [{ id: current.usages[0].id, quantity: qty, unit_cost: 100_000 }],
          },
        });
        expect(result.ok).toBe(false);
      }),
      RUNS,
    );
  });

  it('unit_cost negatif ditolak', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: -1 }), (cost) => {
        const current = makeCurrent();
        const result = normalizeServiceEditRequest({
          reason: 'ubah harga',
          current,
          proposed: {
            usagesUpsert: [{ id: current.usages[0].id, quantity: 1, unit_cost: cost }],
          },
        });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.message).toContain('negatif');
      }),
      RUNS,
    );
  });

  it('edit qty/harga baris yang ada diterima; delete id yang sama konflik', () => {
    const current = makeCurrent();
    const id = current.usages[0].id;

    const okResult = normalizeServiceEditRequest({
      reason: 'koreksi modal',
      current,
      proposed: { usagesUpsert: [{ id, quantity: 2, unit_cost: 90_000 }] },
    });
    expect(okResult.ok).toBe(true);

    const conflict = normalizeServiceEditRequest({
      reason: 'koreksi modal',
      current,
      proposed: { usagesUpsert: [{ id, quantity: 2, unit_cost: 90_000 }], usagesDelete: [id] },
    });
    expect(conflict.ok).toBe(false);
    expect(conflict.ok === false && conflict.message).toContain('sekaligus');
  });

  it('baris baru katalog ditolak, baris baru manual diterima dengan default nama', () => {
    const current = makeCurrent();
    const catalogAdd = normalizeServiceEditRequest({
      reason: 'tambah',
      current,
      proposed: {
        usagesUpsert: [{ sparepart_id: 'bbbbbbbb-0000-4000-8000-000000000000', quantity: 1, unit_cost: 50_000 }],
      },
    });
    expect(catalogAdd.ok).toBe(false);

    const manualAdd = normalizeServiceEditRequest({
      reason: 'tambah',
      current,
      proposed: { usagesUpsert: [{ sparepart_name: '  ', quantity: 1, unit_cost: 50_000 }] },
    });
    expect(manualAdd.ok).toBe(true);
    if (manualAdd.ok) {
      expect(manualAdd.payload.usagesUpsert[0].sparepart_name).toBe('Spare Part Manual');
    }
  });

  it('delete id tak dikenal ditolak; delete valid diterima', () => {
    const current = makeCurrent();
    const unknown = normalizeServiceEditRequest({
      reason: 'hapus',
      current,
      proposed: { usagesDelete: ['ffffffff-0000-4000-8000-000000000000'] },
    });
    expect(unknown.ok).toBe(false);

    const valid = normalizeServiceEditRequest({
      reason: 'hapus',
      current,
      proposed: { usagesDelete: [current.usages[0].id] },
    });
    expect(valid.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property 4: battery health & wage rules
// ---------------------------------------------------------------------------

describe('Property 4: battery health 0-100 dan upah >= 0', () => {
  // Feature: service-edit-approvals, Property 4
  it('battery di luar 0-100 ditolak, dalam rentang diterima', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 150 }), (bh) => {
        const result = normalizeServiceEditRequest({
          reason: 'koreksi bh',
          current: makeCurrent(),
          proposed: { fields: { battery_health: bh } },
        });
        if (bh < 0 || bh > 100) {
          expect(result.ok).toBe(false);
        } else if (bh === 85) {
          expect(result.ok).toBe(false); // sama dengan current → no change
        } else {
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.payload.fields.battery_health).toBe(bh);
        }
      }),
      RUNS,
    );
  });

  it('battery kosong dinormalisasi ke null', () => {
    const result = normalizeServiceEditRequest({
      reason: 'hapus bh',
      current: makeCurrent(),
      proposed: { fields: { battery_health: '' } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.fields.battery_health).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property 5: modal part recomputation & summary
// ---------------------------------------------------------------------------

describe('Property 5: modal part & ringkasan diff', () => {
  // Feature: service-edit-approvals, Property 5
  it('computeProposedModalPart konsisten dengan delete/upsert/add', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (qty, cost, qty2, cost2) => {
          const current = [makeUsage({ quantity: qty, unit_cost: cost })];
          const withoutRow = computeProposedModalPart(current, {
            usagesDelete: [current[0].id],
          });
          expect(withoutRow).toBe(0);

          const edited = computeProposedModalPart(current, {
            usagesUpsert: [{ id: current[0].id, quantity: qty2, unit_cost: cost2 }],
          });
          expect(edited).toBe(qty2 * cost2);

          const added = computeProposedModalPart(current, {
            usagesUpsert: [{ sparepart_name: 'Baru', quantity: qty2, unit_cost: cost2 }],
          });
          expect(added).toBe(qty * cost + qty2 * cost2);
        },
      ),
      RUNS,
    );
  });

  it('ringkasan memuat perubahan upah dan modal part lama→baru', () => {
    const current = makeCurrent();
    const summary = summarizeServiceEditForApproval(current, {
      fields: { wage_amount: 350_000 },
      usagesUpsert: [{ id: current.usages[0].id, quantity: 2, unit_cost: 60_000 }],
    });

    expect(summary).toContain('Upah: Rp 310.000 → Rp 350.000');
    expect(summary.some((l) => l.startsWith('Ubah sparepart:'))).toBe(true);
    expect(summary.some((l) => l.startsWith('Modal part:'))).toBe(true);
  });

  it('ringkasan untuk tambah & hapus baris', () => {
    const current = makeCurrent();
    const summary = summarizeServiceEditForApproval(current, {
      usagesUpsert: [{ sparepart_name: 'Sealant', quantity: 1, unit_cost: 25_000 }],
      usagesDelete: [current.usages[0].id],
    });

    expect(summary.some((l) => l.startsWith('Tambah sparepart manual: Sealant'))).toBe(true);
    expect(summary.some((l) => l.startsWith('Hapus sparepart:'))).toBe(true);
  });
});
