// Feature: user-management
import { supabase } from '@/lib/supabase';
import type { PermissionOverrides } from '@/services/permissionsCore';

export interface ManagedUser {
  id: string;
  username: string | null;
  name: string;
  role: 'MANAJER' | 'KASIR' | 'TEKNISI';
  permissions: PermissionOverrides;
  avatar_url: string | null;
}

export interface CreateUserInput {
  username: string;
  password: string;
  name: string;
  role: ManagedUser['role'];
  permissions: PermissionOverrides;
}

export interface UpdateUserInput {
  name?: string;
  role?: ManagedUser['role'];
  permissions?: PermissionOverrides;
}

async function callAdmin(action: string, payload?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body: { action, payload } });
  if (error) {
    // supabase FunctionsHttpError carries the Response in `context`; the body
    // is our structured { error } payload. Try hard to surface a real message
    // (never let an empty object reach the UI).
    let msg = error.message || 'Gagal menghubungi server';
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.clone().json();
        if (typeof body?.error === 'string' && body.error) msg = body.error;
        else if (typeof body?.message === 'string' && body.message) msg = body.message;
      }
    } catch {
      /* ignore body parse failures, keep msg */
    }
    if (/failed to send a request|failed to fetch|network/i.test(msg)) {
      msg = 'Gagal menghubungi fungsi admin. Cek koneksi atau konfigurasi domain aplikasi.';
    }
    throw new Error(msg);
  }
  if (data && (data as any).error) throw new Error(String((data as any).error));
  return data;
}

function normalize(u: any): ManagedUser {
  return { ...u, permissions: u.permissions ?? {} } as ManagedUser;
}

export async function listUsers(): Promise<ManagedUser[]> {
  const d = await callAdmin('list');
  return (d?.users ?? []).map(normalize);
}

export async function createUser(input: CreateUserInput): Promise<void> {
  await callAdmin('create', { ...input });
}

export async function updateUser(id: string, patch: UpdateUserInput): Promise<void> {
  await callAdmin('update', { id, ...patch });
}

export async function resetUserPassword(id: string, password: string): Promise<void> {
  await callAdmin('reset_password', { id, password });
}

export async function deleteUser(id: string): Promise<void> {
  await callAdmin('delete', { id });
}
