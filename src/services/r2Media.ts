import { supabase } from '@/lib/supabase';

export type R2MediaKind = 'attendance' | 'story';

const R2_PATH_PREFIX = 'r2:';
const readUrlCache = new Map<string, { url: string; expiresAt: number }>();

function isR2Path(value: string): boolean {
  return value.startsWith(R2_PATH_PREFIX);
}

async function requestR2(body: Record<string, string>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Session login tidak ditemukan.');

  const response = await fetch('/api/media/presign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Cloudflare R2 tidak dapat diakses.');
  return payload;
}

export async function uploadR2Webp(kind: R2MediaKind, blob: Blob): Promise<string> {
  if (blob.type !== 'image/webp') throw new Error('Media R2 harus berformat WebP.');
  const signed = await requestR2({ action: 'upload', kind });
  const upload = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/webp' },
    body: blob,
  });
  if (!upload.ok) throw new Error('Upload media ke Cloudflare R2 gagal.');
  return signed.key;
}

export async function getR2MediaUrl(kind: R2MediaKind, key: string): Promise<string | null> {
  if (!isR2Path(key)) return null;
  const cached = readUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const signed = await requestR2({ action: 'read', kind, key });
  const expiresAt = Date.now() + Math.max(30, Number(signed.expiresInSeconds) - 15) * 1000;
  readUrlCache.set(key, { url: signed.downloadUrl, expiresAt });
  return signed.downloadUrl;
}

export async function deleteR2Media(kind: R2MediaKind, key: string): Promise<void> {
  if (!isR2Path(key)) return;
  readUrlCache.delete(key);
  await requestR2({ action: 'delete', kind, key });
}

export function isR2MediaPath(value: string): boolean {
  return isR2Path(value);
}
