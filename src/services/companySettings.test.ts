import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPANY_PROFILE_ID } from './companySettingsCore';
import {
  getCompanyProfile,
  saveCompanyProfile,
  uploadCompanyLogo,
} from './companySettings';

const mocks = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    select: vi.fn(),
    upsert: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  };
  return {
    chain,
    uploadR2CompanyLogo: vi.fn(),
    getR2PublicMediaUrl: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.chain.from,
  },
}));

vi.mock('./r2Media', () => ({
  uploadR2CompanyLogo: mocks.uploadR2CompanyLogo,
  getR2PublicMediaUrl: mocks.getR2PublicMediaUrl,
}));

beforeEach(() => {
  const { chain, uploadR2CompanyLogo, getR2PublicMediaUrl } = mocks;
  chain.from.mockClear().mockReturnValue(chain);
  chain.select.mockClear().mockReturnValue(chain);
  chain.upsert.mockClear().mockReturnValue(chain);
  chain.eq.mockClear().mockReturnValue(chain);
  chain.maybeSingle.mockReset();
  chain.single.mockReset();
  uploadR2CompanyLogo.mockReset();
  getR2PublicMediaUrl.mockReset();
});

describe('companySettings service', () => {
  it('returns the default Sixcode Smart OS profile when the row does not exist', async () => {
    const { chain } = mocks;
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const profile = await getCompanyProfile();

    expect(chain.from).toHaveBeenCalledWith('company_settings');
    expect(chain.eq).toHaveBeenCalledWith('id', COMPANY_PROFILE_ID);
    expect(profile.name).toBe('Sixcode Smart OS');
  });

  it('upserts the company profile row', async () => {
    const { chain } = mocks;
    chain.single.mockResolvedValue({
      data: {
        id: COMPANY_PROFILE_ID,
        name: 'Toko Adam',
        logo_url: 'https://logo.test/a.png',
        login_kicker: 'POS Toko',
        login_badge_label: 'Tim Abah',
        login_headline: 'Masuk ke toko.',
        login_accounts_title: 'Pilih Staff',
        login_footer_label: 'Abah Apple',
        login_feature_one_label: 'Jual',
        login_feature_two_label: 'Stok',
        login_feature_three_label: 'Servis',
      },
      error: null,
    });

    const result = await saveCompanyProfile({
      name: 'Toko Adam',
      logo_url: 'https://logo.test/a.png',
      login_kicker: 'POS Toko',
      login_badge_label: 'Tim Abah',
      login_headline: 'Masuk ke toko.',
      login_accounts_title: 'Pilih Staff',
      login_footer_label: 'Abah Apple',
      login_feature_one_label: 'Jual',
      login_feature_two_label: 'Stok',
      login_feature_three_label: 'Servis',
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: COMPANY_PROFILE_ID,
        name: 'Toko Adam',
        logo_url: 'https://logo.test/a.png',
        login_headline: 'Masuk ke toko.',
        login_accounts_title: 'Pilih Staff',
      }),
      { onConflict: 'id' },
    );
    expect(result.name).toBe('Toko Adam');
    expect(result.login_footer_label).toBe('Abah Apple');
  });

  it('uploads the logo with the original mime type so gif/png files are preserved', async () => {
    const { uploadR2CompanyLogo, getR2PublicMediaUrl } = mocks;
    const file = new File(['gifdata'], 'logo.gif', { type: 'image/gif' });
    uploadR2CompanyLogo.mockResolvedValue('r2:company/user/logo.gif');
    getR2PublicMediaUrl.mockReturnValue('/api/media/public?key=r2%3Acompany%2Fuser%2Flogo.gif');

    const url = await uploadCompanyLogo(file);

    expect(uploadR2CompanyLogo).toHaveBeenCalledWith(file);
    expect(getR2PublicMediaUrl).toHaveBeenCalledWith('r2:company/user/logo.gif');
    expect(url).toBe('/api/media/public?key=r2%3Acompany%2Fuser%2Flogo.gif');
  });
});
