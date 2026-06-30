// Feature: user-management
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { resolveLoginEmail, type PermissionOverrides } from '@/services/permissionsCore';

export interface AuthProfile {
  id: string;
  name: string;
  role: 'MANAJER' | 'KASIR' | 'TEKNISI';
  initials: string;
  email?: string;
  username: string | null;
  permissions: PermissionOverrides;
  avatar_url: string | null;
}

export async function signIn(identifier: string, password: string) {
  const email = resolveLoginEmail(identifier);
  if (email === '') throw new Error('Username atau email tidak valid');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getProfile(userId: string): Promise<AuthProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, initials, username, permissions, avatar_url')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[getProfile]', error.message);
    return null;
  }

  return { ...data, permissions: data.permissions ?? {} } as AuthProfile;
}

export async function changeOwnPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signUp(email: string, password: string, profile: Partial<AuthProfile>) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: profile.name,
        role: profile.role,
        initials: profile.initials,
      },
    },
  });

  if (error) throw error;
  return data;
}
