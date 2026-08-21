// Feature: user-management
import { supabase } from '@/lib/supabase';
import { normalizeAvatarCrop, type AvatarCrop } from '@/services/avatarCrop';
import { uploadR2Image, getR2PublicMediaUrl } from '@/services/r2Media';
import { convertImageFileToWebp } from '@/services/storiesCore';

export async function uploadAvatar(
  userId: string,
  file: File,
  crop?: Partial<AvatarCrop>,
): Promise<string> {
  const media = await convertImageFileToWebp(file, 512, 0.75);
  const key = await uploadR2Image('avatar', media.blob);
  const url = getR2PublicMediaUrl(key);
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
