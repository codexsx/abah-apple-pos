// Feature: complete-backends
// Service layer for spareparts inventory. Mirrors the stock.ts/accounts.ts
// convention: shared supabase client, typed interfaces, getX/createX/updateX/
// deleteX functions, and thrown errors on failure. Money is integer IDR.

import { supabase } from '@/lib/supabase';

export interface Sparepart {
  id: string;
  name: string;
  compatible_type: string;
  stock: number;
  min_stock: number;
  buy_price: number;
  sell_price: number;
  created_at: string;
  updated_at: string;
}

export interface SparepartInsert {
  name: string;
  compatible_type?: string;
  stock: number;
  min_stock: number;
  buy_price: number;
  sell_price: number;
}

export type SparepartUpdate = Partial<SparepartInsert>;

/** Return every sparepart ordered alphabetically by name. */
export async function getSpareparts(): Promise<Sparepart[]> {
  const { data, error } = await supabase
    .from('spareparts')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as Sparepart[]) || [];
}

/** Create a sparepart. */
export async function createSparepart(input: SparepartInsert): Promise<Sparepart> {
  const { data, error } = await supabase
    .from('spareparts')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to create sparepart');
  return data as Sparepart;
}

/** Update a sparepart, refreshing updated_at. */
export async function updateSparepart(
  id: string,
  patch: SparepartUpdate,
): Promise<Sparepart> {
  const { data, error } = await supabase
    .from('spareparts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to update sparepart');
  return data as Sparepart;
}

/** Permanently delete a sparepart. */
export async function deleteSparepart(id: string): Promise<void> {
  const { error } = await supabase.from('spareparts').delete().eq('id', id);
  if (error) throw error;
}
