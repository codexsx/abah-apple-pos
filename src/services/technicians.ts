import { supabase } from '@/lib/supabase';

export interface Technician {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TechnicianInsert {
  name: string;
  is_active?: boolean;
}

export interface TechnicianUpdate {
  name?: string;
  is_active?: boolean;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export async function getTechnicians(): Promise<Technician[]> {
  const { data, error } = await supabase
    .from('technicians')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createTechnician(input: TechnicianInsert): Promise<Technician> {
  const { data, error } = await supabase
    .from('technicians')
    .insert({
      name: normalizeName(input.name),
      is_active: input.is_active ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to create technician');
  return data;
}

export async function updateTechnician(
  id: string,
  patch: TechnicianUpdate,
): Promise<Technician> {
  const update: TechnicianUpdate = { ...patch };
  if (typeof update.name === 'string') update.name = normalizeName(update.name);

  const { data, error } = await supabase
    .from('technicians')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Failed to update technician');
  return data;
}

/**
 * Removes a technician from active forms without erasing their name from
 * historic service records, wage reports, or audit trails.
 */
export async function deactivateTechnician(id: string): Promise<Technician> {
  return updateTechnician(id, { is_active: false });
}
