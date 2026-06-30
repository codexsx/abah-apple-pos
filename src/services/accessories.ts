// Feature: complete-backends
// Service layer for accessory stock. Mirrors the stock.ts/accounts.ts
// convention: shared supabase client, typed interfaces, getX/createX/updateX/
// deleteX functions, and thrown errors on failure. Money is integer IDR.

import { supabase } from '@/lib/supabase';

export interface Accessory {
  id: string;
  name: string;
  category: 'charger' | 'tempered_glass' | 'case' | 'kotak' | 'paperbag';
  stock: number;
  status: 'AMAN' | 'MENIPIS' | 'HABIS';
  min_stock: number;
  price: number;
}

export interface AccessoryInsert {
  name: string;
  category: Accessory['category'];
  stock: number;
  min_stock: number;
  price: number;
  status?: Accessory['status'];
}

export type AccessoryUpdate = Partial<AccessoryInsert>;

/** Derive level status from stock against its minimum threshold. */
function deriveStatus(stock: number, minStock: number): Accessory['status'] {
  if (stock <= 0) return 'HABIS';
  if (stock <= minStock) return 'MENIPIS';
  return 'AMAN';
}

/** Return every accessory ordered alphabetically by name. */
export async function getAccessories(): Promise<Accessory[]> {
  const { data, error } = await supabase
    .from('accessory_stock')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as Accessory[]) || [];
}

/** Create an accessory, computing status when not explicitly provided. */
export async function createAccessory(input: AccessoryInsert): Promise<Accessory> {
  const status = input.status ?? deriveStatus(input.stock, input.min_stock);
  const { data, error } = await supabase
    .from('accessory_stock')
    .insert({ ...input, status })
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to create accessory');
  return data as Accessory;
}

/**
 * Update an accessory. When stock or min_stock is part of the patch, the
 * status is recomputed from the merged values.
 */
export async function updateAccessory(
  id: string,
  patch: AccessoryUpdate,
): Promise<Accessory> {
  const update: AccessoryUpdate = { ...patch };

  if (patch.stock !== undefined || patch.min_stock !== undefined) {
    const { data: current, error: fetchError } = await supabase
      .from('accessory_stock')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    if (!current) throw new Error('Accessory not found');

    const stock = patch.stock ?? (current as Accessory).stock;
    const minStock = patch.min_stock ?? (current as Accessory).min_stock;
    update.status = deriveStatus(stock, minStock);
  }

  const { data, error } = await supabase
    .from('accessory_stock')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to update accessory');
  return data as Accessory;
}

/** Permanently delete an accessory. */
export async function deleteAccessory(id: string): Promise<void> {
  const { error } = await supabase.from('accessory_stock').delete().eq('id', id);
  if (error) throw error;
}

/** Decrease stock by qty via the atomic RPC. */
export async function takeAccessory(id: string, qty: number): Promise<Accessory> {
  const { data, error } = await supabase.rpc('adjust_accessory_stock', {
    p_id: id,
    p_delta: -Math.abs(qty),
  });
  if (error) throw error;
  return data as Accessory;
}

/** Increase stock by qty via the atomic RPC. */
export async function restockAccessory(id: string, qty: number): Promise<Accessory> {
  const { data, error } = await supabase.rpc('adjust_accessory_stock', {
    p_id: id,
    p_delta: Math.abs(qty),
  });
  if (error) throw error;
  return data as Accessory;
}
