import { useContext } from 'react';
import {
  CompanyProfileContext,
  fallbackCompanyProfileContext,
} from '@/contexts/companyProfileContextValue';

export function useCompanyProfile() {
  return useContext(CompanyProfileContext) ?? fallbackCompanyProfileContext;
}
