import { createContext } from 'react';
import {
  DEFAULT_COMPANY_PROFILE,
  type CompanyProfile,
} from '@/services/companySettingsCore';

export interface CompanyProfileContextValue {
  companyProfile: CompanyProfile;
  isCompanyLoading: boolean;
  companyError: string | null;
  refreshCompanyProfile: () => Promise<CompanyProfile>;
  setCompanyProfile: (profile: CompanyProfile) => void;
}

export const fallbackCompanyProfileContext: CompanyProfileContextValue = {
  companyProfile: DEFAULT_COMPANY_PROFILE,
  isCompanyLoading: false,
  companyError: null,
  refreshCompanyProfile: async () => DEFAULT_COMPANY_PROFILE,
  setCompanyProfile: () => undefined,
};

export const CompanyProfileContext = createContext<CompanyProfileContextValue | null>(null);
