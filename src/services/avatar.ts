// Feature: user-management
import { supabase } from '@/lib/supabase';
import { normalizeAvatarCrop, type AvatarCrop } from '@/services/avatarCrop';

export async function uploadAvatar(
  userId: string,
  file: File,
  crop?: Partial<AvatarCrop>,
): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  const url = pub.publicUrl;
  const { error: updErr } = await supabase
    .from('profiles')
    .update({
      avatar_url: url,
      ...normalizeAvatarCrop(crop),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (updErr) throw updErr;
  return url;
}

export async function updateAvatarCrop(userId: string, crop: Partial<AvatarCrop>): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      ...normalizeAvatarCrop(crop),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}
