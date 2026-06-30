export interface CompanyProfile {
  id: string;
  name: string;
  logo_url: string | null;
  login_kicker: string;
  login_badge_label: string;
  login_headline: string;
  login_accounts_title: string;
  login_footer_label: string;
  login_feature_one_label: string;
  login_feature_two_label: string;
  login_feature_three_label: string;
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

export interface LoginPageCopy {
  login_kicker: string;
  login_badge_label: string;
  login_headline: string;
  login_accounts_title: string;
  login_footer_label: string;
  login_feature_one_label: string;
  login_feature_two_label: string;
  login_feature_three_label: string;
}

export const DEFAULT_LOGIN_PAGE_COPY: LoginPageCopy = {
  login_kicker: 'Smart POS',
  login_badge_label: 'Staff Access',
  login_headline: 'Masuk cepat untuk operasional toko.',
  login_accounts_title: 'Staff Terdaftar',
  login_footer_label: 'Sixcode Smart OS',
  login_feature_one_label: 'Kasir',
  login_feature_two_label: 'Stok',
  login_feature_three_label: 'Servis',
};

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  id: COMPANY_PROFILE_ID,
  name: 'Sixcode Smart OS',
  logo_url: null,
  ...DEFAULT_LOGIN_PAGE_COPY,
  updated_at: null,
};

const ALLOWED_LOGO_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const LOGIN_COPY_LIMITS: Record<keyof LoginPageCopy, number> = {
  login_kicker: 40,
  login_badge_label: 40,
  login_headline: 120,
  login_accounts_title: 60,
  login_footer_label: 60,
  login_feature_one_label: 24,
  login_feature_two_label: 24,
  login_feature_three_label: 24,
};

function normalizeText(
  value: string | null | undefined,
  fallback: string,
  maxLength: number,
): string {
  const text = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function normalizeLoginPageCopy(
  profile: Partial<LoginPageCopy> | null | undefined,
): LoginPageCopy {
  return {
    login_kicker: normalizeText(
      profile?.login_kicker,
      DEFAULT_LOGIN_PAGE_COPY.login_kicker,
      LOGIN_COPY_LIMITS.login_kicker,
    ),
    login_badge_label: normalizeText(
      profile?.login_badge_label,
      DEFAULT_LOGIN_PAGE_COPY.login_badge_label,
      LOGIN_COPY_LIMITS.login_badge_label,
    ),
    login_headline: normalizeText(
      profile?.login_headline,
      DEFAULT_LOGIN_PAGE_COPY.login_headline,
      LOGIN_COPY_LIMITS.login_headline,
    ),
    login_accounts_title: normalizeText(
      profile?.login_accounts_title,
      DEFAULT_LOGIN_PAGE_COPY.login_accounts_title,
      LOGIN_COPY_LIMITS.login_accounts_title,
    ),
    login_footer_label: normalizeText(
      profile?.login_footer_label,
      DEFAULT_LOGIN_PAGE_COPY.login_footer_label,
      LOGIN_COPY_LIMITS.login_footer_label,
    ),
    login_feature_one_label: normalizeText(
      profile?.login_feature_one_label,
      DEFAULT_LOGIN_PAGE_COPY.login_feature_one_label,
      LOGIN_COPY_LIMITS.login_feature_one_label,
    ),
    login_feature_two_label: normalizeText(
      profile?.login_feature_two_label,
      DEFAULT_LOGIN_PAGE_COPY.login_feature_two_label,
      LOGIN_COPY_LIMITS.login_feature_two_label,
    ),
    login_feature_three_label: normalizeText(
      profile?.login_feature_three_label,
      DEFAULT_LOGIN_PAGE_COPY.login_feature_three_label,
      LOGIN_COPY_LIMITS.login_feature_three_label,
    ),
  };
}

export function validateLoginPageCopy(copy: Partial<LoginPageCopy>): LogoValidationResult {
  for (const [key, maxLength] of Object.entries(LOGIN_COPY_LIMITS)) {
    const value = copy[key as keyof LoginPageCopy];
    if (typeof value === 'string' && value.trim().length > maxLength) {
      return { ok: false, message: 'Teks halaman login terlalu panjang.' };
    }
  }
  return { ok: true };
}

export function normalizeCompanyProfile(
  profile: Partial<CompanyProfile> | null | undefined,
): CompanyProfile {
  const name = typeof profile?.name === 'string' && profile.name.trim()
    ? profile.name.trim()
    : DEFAULT_COMPANY_PROFILE.name;
  const loginCopy = normalizeLoginPageCopy(profile);

  return {
    id: profile?.id || DEFAULT_COMPANY_PROFILE.id,
    name,
    logo_url: profile?.logo_url || null,
    ...loginCopy,
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
