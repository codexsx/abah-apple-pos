import { useAuth } from '@/contexts/AuthContext';
import { canViewAgentMoney } from '@/services/permissionsCore';

export function useCanViewAgentMoney(): boolean {
  const { profile } = useAuth();
  return canViewAgentMoney(profile?.role, profile?.permissions);
}
