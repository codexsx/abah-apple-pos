import { supabase } from '@/lib/supabase';
import type { StockStatus } from '@/services/stockCore';
import { deriveStockLevelStatus, clampStock } from '@/services/inventoryCore';

export interface StockItem {
  id: string;
  model: string;
  capacity: string;
  condition: string;
  color: string;
  imei: string | null;
  has_imei: boolean;
  status: StockStatus;
  count: number;
  price: number;
  cost_price: number;
  battery_health?: number | null;
  carrier?: string;
  defect_description?: string;
  source_agent_id?: string | null;
  import_batch_id?: string | null;
  source_row_number?: number | null;
  import_note?: string;
  created_at: string;
  updated_at: string;
}

export interface StockItemInsert {
  model: string;
  capacity?: string;
  condition?: string;
  color?: string;
  imei?: string | null;
  has_imei?: boolean;
  status?: StockStatus;
  count?: number;
  price?: number;
  cost_price?: number;
  battery_health?: number | null;
  carrier?: string;
  defect_description?: string;
  source_agent_id?: string | null;
  import_batch_id?: string | null;
  source_row_number?: number | null;
  import_note?: string;
}

export interface StockItemUpdate {
  model?: string;
  capacity?: string;
  condition?: string;
  color?: string;
  imei?: string | null;
  has_imei?: boolean;
  status?: StockStatus;
  count?: number;
  price?: number;
  cost_price?: number;
  battery_health?: number | null;
  carrier?: string;
  defect_description?: string;
  source_agent_id?: string | null;
  import_batch_id?: string | null;
  source_row_number?: number | null;
  import_note?: string;
}

export interface AccessoryItem {
  id: string;
  name: string;
  category: 'charger' | 'tempered_glass' | 'case' | 'kotak' | 'paperbag';
  stock: number;
  min_stock: number;
  price: number;
  status: 'AMAN' | 'MENIPIS' | 'HABIS';
}

export interface AccessoryInsert {
  name: string;
  category: AccessoryItem['category'];
  stock: number;
  min_stock: number;
  price: number;
}

export type AccessoryUpdate = Partial<AccessoryInsert>;

export async function getStockItems(): Promise<StockItem[]> {
  const { data, error } = await supabase.from('stock_items').select('*').order('model', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getStockItemById(id: string): Promise<StockItem | null> {
  const { data, error } = await supabase.from('stock_items').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function createStockItem(item: StockItemInsert): Promise<StockItem> {
  const { data, error } = await supabase.from('stock_items').insert(item).select().single();
  if (error) throw error;
  if (!data) throw new Error('Failed to create stock item');
  return data;
}

export async function updateStockItem(id: string, item: StockItemUpdate): Promise<StockItem> {
  const { data, error } = await supabase.from('stock_items').update(item).eq('id', id).select().single();
  if (error) throw error;
  if (!data) throw new Error('Failed to update stock item');
  return data;
}

/** Update only the status; throws on Supabase error (Req 7.3, 7.4). */
export async function updateStockStatus(id: string, status: StockStatus): Promise<StockItem> {
  const { data, error } = await supabase.from('stock_items').update({ status }).eq('id', id).select().single();
  if (error) throw error;
  if (!data) throw new Error('Failed to update stock status');
  return data;
}

export async function moveStockUnitStatus(
  id: string,
  status: StockStatus,
): Promise<StockItem[]> {
  const { data, error } = await supabase.rpc('move_stock_unit_status', {
    p_stock_id: id,
    p_target_status: status,
  });
  if (error) throw error;
  return (data || []) as StockItem[];
}

export async function deleteStockItem(id: string): Promise<void> {
  const { error } = await supabase.from('stock_items').delete().eq('id', id);
  if (error) throw error;
}

export async function getAccessoryStock(): Promise<AccessoryItem[]> {
  const { data, error } = await supabase.from('accessory_stock').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createAccessory(input: AccessoryInsert): Promise<AccessoryItem> {
  const status = deriveStockLevelStatus(input.stock, input.min_stock);
  const { data, error } = await supabase
    .from('accessory_stock')
    .insert({ ...input, status })
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to create accessory');
  return data;
}

export async function updateAccessory(id: string, patch: AccessoryUpdate): Promise<AccessoryItem> {
  const { data: current, error: fetchError } = await supabase
    .from('accessory_stock')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;
  if (!current) throw new Error('Accessory not found');

  const merged = { ...current, ...patch };
  const status = deriveStockLevelStatus(merged.stock, merged.min_stock);

  const { data, error } = await supabase
    .from('accessory_stock')
    .update({ ...patch, status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to update accessory');
  return data;
}

export async function deleteAccessory(id: string): Promise<void> {
  const { error } = await supabase.from('accessory_stock').delete().eq('id', id);
  if (error) throw error;
}

export async function adjustAccessoryStock(id: string, delta: number): Promise<AccessoryItem> {
  const { data: current, error: fetchError } = await supabase
    .from('accessory_stock')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;
  if (!current) throw new Error('Accessory not found');

  const next = clampStock(current.stock + delta);
  const status = deriveStockLevelStatus(next, current.min_stock);

  const { data, error } = await supabase
    .from('accessory_stock')
    .update({ stock: next, status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to adjust accessory stock');
  return data;
}
