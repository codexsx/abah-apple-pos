import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_COMPANY_PROFILE,
  type CompanyProfile,
} from '@/services/companySettingsCore';
import { getCompanyProfile } from '@/services/companySettings';
import { CompanyProfileContext } from '@/contexts/companyProfileContextValue';

function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (typeof err === 'string' && err.trim()) return err;
  return 'Gagal memuat profil perusahaan.';
}

export function CompanyProfileProvider({ children }: { children: React.ReactNode }) {
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [isCompanyLoading, setIsCompanyLoading] = useState(true);
  const [companyError, setCompanyError] = useState<string | null>(null);

  const refreshCompanyProfile = useCallback(async () => {
    setIsCompanyLoading(true);
    setCompanyError(null);
    try {
      const profile = await getCompanyProfile();
      setCompanyProfile(profile);
      return profile;
    } catch (err) {
      setCompanyError(errorMessage(err));
      setCompanyProfile(DEFAULT_COMPANY_PROFILE);
      return DEFAULT_COMPANY_PROFILE;
    } finally {
      setIsCompanyLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCompanyProfile();
  }, [refreshCompanyProfile]);

  const value = useMemo(
    () => ({
      companyProfile,
      isCompanyLoading,
      companyError,
      refreshCompanyProfile,
      setCompanyProfile,
    }),
    [companyProfile, isCompanyLoading, companyError, refreshCompanyProfile],
  );

  return (
    <CompanyProfileContext.Provider value={value}>
      {children}
    </CompanyProfileContext.Provider>
  );
}
