import { describe, expect, it } from 'vitest';
import { getCanonicalRedirectUrl } from './canonicalHost';

function makeLocation(hostname: string, pathname = '/', search = '', hash = '') {
  return {
    hostname,
    pathname,
    search,
    hash,
  };
}

describe('getCanonicalRedirectUrl', () => {
  it('redirects the old Vercel production domain to the custom www domain', () => {
    expect(
      getCanonicalRedirectUrl(
        makeLocation('abah-apple-pos.vercel.app', '/login', '?from=staff', '#pin'),
      ),
    ).toBe('https://www.abahapplepontianak.my.id/login?from=staff#pin');
  });

  it('redirects old Vercel branch aliases to the custom www domain', () => {
    expect(
      getCanonicalRedirectUrl(
        makeLocation('abah-apple-pos-git-main-abah-apple-pos.vercel.app', '/stok'),
      ),
    ).toBe('https://www.abahapplepontianak.my.id/stok');
  });

  it('redirects renamed project and deployment Vercel aliases to the custom www domain', () => {
    expect(
      getCanonicalRedirectUrl(
        makeLocation('abah-apple-pontianak-system-git-main-abah-apple-pos.vercel.app', '/agen'),
      ),
    ).toBe('https://www.abahapplepontianak.my.id/agen');

    expect(
      getCanonicalRedirectUrl(
        makeLocation('abah-apple-pontianak-system-mtin3tm0n-abah-apple-pos.vercel.app', '/login'),
      ),
    ).toBe('https://www.abahapplepontianak.my.id/login');
  });

  it('does not redirect the canonical domain or local development', () => {
    expect(getCanonicalRedirectUrl(makeLocation('www.abahapplepontianak.my.id'))).toBeNull();
    expect(getCanonicalRedirectUrl(makeLocation('localhost'))).toBeNull();
    expect(getCanonicalRedirectUrl(makeLocation('127.0.0.1'))).toBeNull();
  });

  it('redirects the root custom domain to the www custom domain', () => {
    expect(getCanonicalRedirectUrl(makeLocation('abahapplepontianak.my.id', '/dashboard'))).toBe(
      'https://www.abahapplepontianak.my.id/dashboard',
    );
  });
});
