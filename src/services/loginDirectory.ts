import { supabase } from '@/lib/supabase';
import { normalizeAvatarCrop, type AvatarCrop } from '@/services/avatarCrop';
import type { AppRole } from '@/services/permissionsCore';

export interface LoginAccount extends AvatarCrop {
  id: string;
  name: string;
  role: AppRole;
  initials: string;
  username: string;
  avatar_url: string | null;
}

const ROLE_ORDER: Record<AppRole, number> = {
  MANAJER: 0,
  KEUANGAN: 1,
  KASIR: 2,
  TEKNISI: 3,
};

function initialsFromName(name: string, username: string): string {
  const base = (name || username || 'U').trim();
  return base.slice(0, 2).toUpperCase() || 'U';
}

function normalizeLoginAccount(row: Partial<LoginAccount>): LoginAccount | null {
  const username = typeof row.username === 'string' ? row.username.trim() : '';
  if (!username) return null;

  const role: AppRole =
    row.role === 'KEUANGAN' || row.role === 'KASIR' || row.role === 'TEKNISI'
      ? row.role
      : 'MANAJER';
  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : username;

  return {
    id: String(row.id || username),
    name,
    role,
    initials: typeof row.initials === 'string' && row.initials.trim()
      ? row.initials.trim().slice(0, 2).toUpperCase()
      : initialsFromName(name, username),
    username,
    avatar_url: row.avatar_url || null,
    ...normalizeAvatarCrop(row),
  };
}

export async function getLoginAccounts(): Promise<LoginAccount[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, initials, username, avatar_url, avatar_crop_x, avatar_crop_y, avatar_zoom, is_hidden_owner')
    .not('username', 'is', null)
    .eq('is_hidden_owner', false);

  if (error) throw error;

  return (data ?? [])
    .map((row) => normalizeLoginAccount(row as Partial<LoginAccount>))
    .filter((row): row is LoginAccount => row !== null)
    .sort((a, b) => {
      const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      if (roleDiff !== 0) return roleDiff;
      return a.name.localeCompare(b.name, 'id');
    });
}
