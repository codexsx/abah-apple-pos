import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_TITLE,
  DEFAULT_FAVICON_HREF,
  applyDocumentBrand,
  getDocumentIconHref,
  getDocumentTitle,
} from '@/services/documentBrand';

describe('documentBrand', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.title = '';
  });

  it('builds the browser tab title from the company name', () => {
    expect(getDocumentTitle({ name: 'Abah Apple', logo_url: null })).toBe('Abah Apple - POS');
  });

  it('uses fallback title and icon when profile data is missing', () => {
    expect(getDocumentTitle(null)).toBe(DEFAULT_DOCUMENT_TITLE);
    expect(getDocumentIconHref(null)).toBe(DEFAULT_FAVICON_HREF);
  });

  it('applies title and icon links to the document', () => {
    applyDocumentBrand({
      name: 'Abah Apple',
      logo_url: 'https://example.test/logo.gif',
    });

    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const touchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');

    expect(document.title).toBe('Abah Apple - POS');
    expect(favicon?.href).toBe('https://example.test/logo.gif');
    expect(favicon?.type).toBe('image/gif');
    expect(touchIcon?.href).toBe('https://example.test/logo.gif');
  });
});
