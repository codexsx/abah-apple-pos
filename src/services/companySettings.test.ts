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
    upload: vi.fn(),
    getPublicUrl: vi.fn(),
    storageFrom: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.chain.from,
    storage: {
      from: mocks.storageFrom,
    },
  },
}));

beforeEach(() => {
  const { chain, upload, getPublicUrl, storageFrom } = mocks;
  chain.from.mockClear().mockReturnValue(chain);
  chain.select.mockClear().mockReturnValue(chain);
  chain.upsert.mockClear().mockReturnValue(chain);
  chain.eq.mockClear().mockReturnValue(chain);
  chain.maybeSingle.mockReset();
  chain.single.mockReset();
  upload.mockReset();
  getPublicUrl.mockReset();
  storageFrom.mockReset().mockReturnValue({ upload, getPublicUrl });
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
      data: { id: COMPANY_PROFILE_ID, name: 'Toko Adam', logo_url: 'https://logo.test/a.png' },
      error: null,
    });

    const result = await saveCompanyProfile({
      name: 'Toko Adam',
      logo_url: 'https://logo.test/a.png',
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: COMPANY_PROFILE_ID,
        name: 'Toko Adam',
        logo_url: 'https://logo.test/a.png',
      }),
      { onConflict: 'id' },
    );
    expect(result.name).toBe('Toko Adam');
  });

  it('uploads the logo with the original mime type so gif/png files are preserved', async () => {
    const { upload, getPublicUrl, storageFrom } = mocks;
    const file = new File(['gifdata'], 'logo.gif', { type: 'image/gif' });
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://logo.test/logo.gif' } });

    const url = await uploadCompanyLogo(file);

    expect(storageFrom).toHaveBeenCalledWith('company-assets');
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^logos\/\d+-logo\.gif$/),
      file,
      expect.objectContaining({ contentType: 'image/gif', upsert: true }),
    );
    expect(url).toBe('https://logo.test/logo.gif');
  });
});
