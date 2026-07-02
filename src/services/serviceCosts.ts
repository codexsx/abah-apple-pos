export interface ServiceCostDraft {
  sparePartCost: string | number;
  wageAmount: string | number;
  dp?: string | number;
}

export interface ServiceCostPayload {
  sparePartCost: number;
  wageAmount: number;
  workCost: number;
  estimatedCost: number;
}

export type ServiceCostValidationResult =
  | { ok: true; payload: ServiceCostPayload }
  | { ok: false; field: 'upah' | 'dp'; message: string };

export function parseIdrAmount(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function buildServiceCostPayload(draft: ServiceCostDraft): ServiceCostPayload {
  const sparePartCost = parseIdrAmount(draft.sparePartCost);
  const wageAmount = parseIdrAmount(draft.wageAmount);

  return {
    sparePartCost,
    wageAmount,
    workCost: wageAmount,
    estimatedCost: sparePartCost + wageAmount,
  };
}

export function validateServiceCostDraft(draft: ServiceCostDraft): ServiceCostValidationResult {
  const payload = buildServiceCostPayload(draft);
  if (payload.wageAmount <= 0) {
    return {
      ok: false,
      field: 'upah',
      message: 'Upah wajib diisi.',
    };
  }

  const dp = parseIdrAmount(draft.dp);
  if (dp > payload.estimatedCost) {
    return {
      ok: false,
      field: 'dp',
      message: 'DP tidak boleh melebihi estimasi total.',
    };
  }

  return { ok: true, payload };
}
