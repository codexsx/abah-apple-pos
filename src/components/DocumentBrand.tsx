import { useEffect } from 'react';
import { useCompanyProfile } from '@/contexts/useCompanyProfile';
import { applyDocumentBrand } from '@/services/documentBrand';

export default function DocumentBrand() {
  const { companyProfile } = useCompanyProfile();

  useEffect(() => {
    applyDocumentBrand(companyProfile);
  }, [companyProfile]);

  return null;
}
