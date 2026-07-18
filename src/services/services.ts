import { supabase } from '@/lib/supabase';
import type { StockStatus } from '@/services/stockCore';
import type { TransactionStaff } from '@/services/transactions';
export {
  getTechnicians,
  createTechnician,
  updateTechnician,
  deactivateTechnician,
  type Technician,
  type TechnicianInsert,
  type TechnicianUpdate,
} from '@/services/technicians';

export interface ServiceRecord {
  id: string;
  customer_name: string;
  phone_model: string;
  capacity: string;
  condition: string;
  color: string;
  imei: string;
  battery_health: number | null;
  issue: string;
  additional_note: string;
  status: 'ANTRIAN' | 'PROSES' | 'SELESAI' | 'GAGAL';
  estimated_cost: number;
  work_cost?: number;
  dp: number;
  created_at: string;
  completed_at: string | null;
  technician: string;
  service_type: 'Customer' | 'Toko Sendiri' | 'Klaim Garansi';
  stk_id: string;
  /** Manual technician wage for this service (Opsi 1). */
  wage_amount: number;
  /** True once the wage has been paid to the technician. */
  wage_paid: boolean;
  /** True once the customer has collected the finished unit. */
  picked_up: boolean;
  picked_up_at: string | null;
  created_by?: string | null;
  created_by_staff?: TransactionStaff | null;
}

export type ServiceRecordInsert = Omit<ServiceRecord, 'id' | 'created_at' | 'created_by' | 'created_by_staff'>;
export type ServiceRecordUpdate = Partial<ServiceRecordInsert>;

export interface ServiceSparepartUsage {
  id: string;
  service_record_id: string;
  sparepart_id: string | null;
  sparepart_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
}

const SERVICE_RECORD_SELECT = '*, created_by_staff:profiles!service_records_created_by_fkey(id, name, role, initials)';
export const MANUAL_SERVICE_SPAREPART_NAME = 'Spare Part Manual';

export async function getServiceRecords(): Promise<ServiceRecord[]> {
  const { data, error } = await supabase
    .from('service_records')
    .select(SERVICE_RECORD_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getServiceRecordById(id: string): Promise<ServiceRecord | null> {
  const { data, error } = await supabase.from('service_records').select(SERVICE_RECORD_SELECT).eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function createServiceRecord(record: ServiceRecordInsert): Promise<ServiceRecord> {
  const { data, error } = await supabase.from('service_records').insert(record).select(SERVICE_RECORD_SELECT).single();
  if (error) throw error;
  if (!data) throw new Error('Failed to create service record');
  return data;
}

export async function recordServiceWithStockStatus(input: {
  stockId: string;
  targetStatus: StockStatus;
  record: ServiceRecordInsert;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_service_with_stock_status', {
    p_stock_id: input.stockId,
    p_target_status: input.targetStatus,
    p_record: input.record,
  });
  if (error) throw error;
  return data as string;
}

export async function getServiceSparepartUsages(): Promise<ServiceSparepartUsage[]> {
  const { data, error } = await supabase
    .from('service_sparepart_usages')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ServiceSparepartUsage[]) || [];
}

export async function recordServiceSparepartUsage(input: {
  serviceRecordId: string;
  sparepartId: string;
  quantity: number;
  unitCost: number;
}): Promise<ServiceSparepartUsage> {
  const { data, error } = await supabase.rpc('record_service_sparepart_usage', {
    p_service_record_id: input.serviceRecordId,
    p_sparepart_id: input.sparepartId,
    p_quantity: input.quantity,
    p_unit_cost: input.unitCost,
  });
  if (error) throw error;
  if (!data) throw new Error('Failed to record service sparepart usage');
  return data as ServiceSparepartUsage;
}

export async function recordManualServiceSparepartCost(input: {
  serviceRecordId: string;
  totalCost: number;
  name?: string;
}): Promise<ServiceSparepartUsage | null> {
  const totalCost = Number.isFinite(input.totalCost) ? Math.floor(input.totalCost) : 0;
  if (totalCost <= 0) return null;

  const { data, error } = await supabase
    .from('service_sparepart_usages')
    .insert({
      service_record_id: input.serviceRecordId,
      sparepart_id: null,
      sparepart_name: input.name ?? MANUAL_SERVICE_SPAREPART_NAME,
      quantity: 1,
      unit_cost: totalCost,
    })
    .select('*')
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to record manual service sparepart cost');

  const { error: recalcError } = await supabase.rpc('recalculate_service_total_cost', {
    p_service_record_id: input.serviceRecordId,
  });
  if (recalcError) throw recalcError;

  return data as ServiceSparepartUsage;
}

export async function updateServiceCostFields(input: {
  serviceRecordId: string;
  workCost: number;
  wageAmount: number;
}): Promise<void> {
  const { error } = await supabase.rpc('update_service_cost_fields', {
    p_service_record_id: input.serviceRecordId,
    p_work_cost: input.workCost,
    p_wage_amount: input.wageAmount,
  });
  if (error) throw error;
}

export async function updateServiceRecord(id: string, record: ServiceRecordUpdate): Promise<ServiceRecord> {
  const { data, error } = await supabase.from('service_records').update(record).eq('id', id).select(SERVICE_RECORD_SELECT).single();
  if (error) throw error;
  if (!data) throw new Error('Failed to update service record');
  return data;
}

export async function deleteServiceRecord(id: string): Promise<void> {
  const { error } = await supabase.from('service_records').delete().eq('id', id);
  if (error) throw error;
}
