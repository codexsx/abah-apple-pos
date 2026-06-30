export interface CompanyProfile {
  id: string;
  name: string;
  logo_url: string | null;
  updated_at?: string | null;
}

export interface LogoFileLike {
  name?: string;
  type?: string;
  size?: number;
}

export type LogoValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export const COMPANY_PROFILE_ID = 'company_profile';

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  id: COMPANY_PROFILE_ID,
  name: 'Sixcode Smart OS',
  logo_url: null,
  updated_at: null,
};

const ALLOWED_LOGO_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export function normalizeCompanyProfile(
  profile: Partial<CompanyProfile> | null | undefined,
): CompanyProfile {
  const name = typeof profile?.name === 'string' && profile.name.trim()
    ? profile.name.trim()
    : DEFAULT_COMPANY_PROFILE.name;

  return {
    id: profile?.id || DEFAULT_COMPANY_PROFILE.id,
    name,
    logo_url: profile?.logo_url || null,
    updated_at: profile?.updated_at ?? null,
  };
}

export function isAllowedCompanyLogoMime(type: string | null | undefined): boolean {
  return ALLOWED_LOGO_MIME_TYPES.has((type || '').toLowerCase());
}

export function validateCompanyName(name: string): LogoValidationResult {
  if (!name.trim()) return { ok: false, message: 'Nama perusahaan wajib diisi.' };
  if (name.trim().length > 80) return { ok: false, message: 'Nama perusahaan maksimal 80 karakter.' };
  return { ok: true };
}

export function validateCompanyLogoFile(file: LogoFileLike | null | undefined): LogoValidationResult {
  if (!file) return { ok: true };
  if (!isAllowedCompanyLogoMime(file.type)) {
    return { ok: false, message: 'Logo harus berupa PNG, GIF, WebP, atau JPG.' };
  }
  if ((file.size ?? 0) > MAX_LOGO_BYTES) {
    return { ok: false, message: 'Ukuran logo maksimal 5 MB.' };
  }
  return { ok: true };
}
