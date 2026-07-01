import { useAuth } from '@/contexts/AuthContext';
import { effectivePermission } from '@/services/permissionsCore';

export function useCanViewNominal(): boolean {
  const { profile } = useAuth();
  return effectivePermission(profile?.role, profile?.permissions, 'finance');
}
