import {
  DEFAULT_COMPANY_PROFILE,
  type CompanyProfile,
} from '@/services/companySettingsCore';

export const DEFAULT_FAVICON_HREF = '/favicon.svg';
export const DEFAULT_DOCUMENT_TITLE = `${DEFAULT_COMPANY_PROFILE.name} - POS`;

type DocumentBrandProfile = Pick<CompanyProfile, 'name' | 'logo_url'>;

export function getDocumentTitle(profile?: Partial<DocumentBrandProfile> | null): string {
  const companyName = typeof profile?.name === 'string' && profile.name.trim()
    ? profile.name.trim()
    : DEFAULT_COMPANY_PROFILE.name;

  return `${companyName} - POS`;
}

export function getDocumentIconHref(profile?: Partial<DocumentBrandProfile> | null): string {
  return typeof profile?.logo_url === 'string' && profile.logo_url.trim()
    ? profile.logo_url.trim()
    : DEFAULT_FAVICON_HREF;
}

function inferIconMimeType(href: string): string {
  const cleanHref = href.toLowerCase().split(/[?#]/)[0] ?? '';
  if (cleanHref.endsWith('.svg')) return 'image/svg+xml';
  if (cleanHref.endsWith('.gif')) return 'image/gif';
  if (cleanHref.endsWith('.png')) return 'image/png';
  if (cleanHref.endsWith('.webp')) return 'image/webp';
  if (cleanHref.endsWith('.jpg') || cleanHref.endsWith('.jpeg')) return 'image/jpeg';
  return '';
}

function upsertIconLink(rel: string, href: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }

  link.href = href;

  const mimeType = inferIconMimeType(href);
  if (mimeType && rel === 'icon') {
    link.type = mimeType;
  } else {
    link.removeAttribute('type');
  }
}

export function applyDocumentBrand(profile?: Partial<DocumentBrandProfile> | null) {
  if (typeof document === 'undefined') return;

  const href = getDocumentIconHref(profile);
  document.title = getDocumentTitle(profile);
  upsertIconLink('icon', href);
  upsertIconLink('apple-touch-icon', href);
}
