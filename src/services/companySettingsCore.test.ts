import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPANY_PROFILE,
  isAllowedCompanyLogoMime,
  normalizeCompanyProfile,
  validateCompanyLogoFile,
} from './companySettingsCore';

describe('companySettingsCore', () => {
  it('uses Sixcode Smart OS as the default company profile', () => {
    expect(DEFAULT_COMPANY_PROFILE.name).toBe('Sixcode Smart OS');
    expect(normalizeCompanyProfile(null).name).toBe('Sixcode Smart OS');
  });

  it('allows animated gif and common raster image logo formats', () => {
    expect(isAllowedCompanyLogoMime('image/gif')).toBe(true);
    expect(isAllowedCompanyLogoMime('image/png')).toBe(true);
    expect(isAllowedCompanyLogoMime('image/webp')).toBe(true);
    expect(isAllowedCompanyLogoMime('image/jpeg')).toBe(true);
  });

  it('rejects non-logo file types', () => {
    const result = validateCompanyLogoFile({
      name: 'profile.pdf',
      type: 'application/pdf',
      size: 1200,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected validation to reject non-image file');
    expect(result.message).toMatch(/PNG, GIF, WebP, atau JPG/i);
  });
});
