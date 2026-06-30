export const CANONICAL_HOST = 'www.abahapplepontianak.my.id';
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

const REDIRECT_HOSTS = new Set([
  'abahapplepontianak.my.id',
  'abah-apple-pos.vercel.app',
  'abah-apple-pos-abah-apple-pos.vercel.app',
  'abah-apple-pos-git-main-abah-apple-pos.vercel.app',
]);

type LocationLike = Pick<Location, 'hostname' | 'pathname' | 'search' | 'hash'>;

export function getCanonicalRedirectUrl(location: LocationLike): string | null {
  const hostname = location.hostname.toLowerCase();

  if (!REDIRECT_HOSTS.has(hostname)) {
    return null;
  }

  const redirectUrl = new URL(location.pathname || '/', CANONICAL_ORIGIN);
  redirectUrl.search = location.search || '';
  redirectUrl.hash = location.hash || '';

  return redirectUrl.toString();
}
