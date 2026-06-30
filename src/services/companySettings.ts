import { supabase } from '@/lib/supabase';
import {
  COMPANY_PROFILE_ID,
  normalizeCompanyProfile,
  validateCompanyLogoFile,
  validateCompanyName,
  type CompanyProfile,
} from './companySettingsCore';

const COMPANY_SETTINGS_TABLE = 'company_settings';
const COMPANY_ASSETS_BUCKET = 'company-assets';

function fileExtension(name: string | undefined, type: string | undefined): string {
  const fromName = name?.split('.').pop()?.toLowerCase();
  if (fromName) return fromName;
  if (type === 'image/gif') return 'gif';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

export async function getCompanyProfile(): Promise<CompanyProfile> {
  const { data, error } = await supabase
    .from(COMPANY_SETTINGS_TABLE)
    .select('*')
    .eq('id', COMPANY_PROFILE_ID)
    .maybeSingle();

  if (error) throw error;
  return normalizeCompanyProfile(data as Partial<CompanyProfile> | null);
}

export async function saveCompanyProfile(input: {
  name: string;
  logo_url?: string | null;
}): Promise<CompanyProfile> {
  const validation = validateCompanyName(input.name);
  if (!validation.ok) throw new Error(validation.message);

  const payload = {
    id: COMPANY_PROFILE_ID,
    name: input.name.trim(),
    logo_url: input.logo_url ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(COMPANY_SETTINGS_TABLE)
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;
  return normalizeCompanyProfile(data as Partial<CompanyProfile>);
}

export async function uploadCompanyLogo(file: File): Promise<string> {
  const validation = validateCompanyLogoFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const ext = fileExtension(file.name, file.type);
  const path = `logos/${Date.now()}-logo.${ext}`;
  const { error } = await supabase.storage
    .from(COMPANY_ASSETS_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });

  if (error) throw error;
  const { data } = supabase.storage.from(COMPANY_ASSETS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
