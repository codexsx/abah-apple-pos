// Feature: role-based-access
import { type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { canViewNominal } from '@/services/accessCore';

/** True iff the current user may view aggregate nominal figures (Boss only). */
export function useCanViewNominal(): boolean {
  const { profile } = useAuth();
  return canViewNominal(profile?.role);
}

export interface NominalGuardProps {
  children: ReactNode;
  /** Shown to users who may not view nominal figures. Default "••••". */
  placeholder?: ReactNode;
}

/**
 * Renders `children` (a money/aggregate figure) only for users allowed to view
 * nominal figures; otherwise renders a masked placeholder. Feature: role-based-access (Req 4).
 */
export default function NominalGuard({ children, placeholder = '••••' }: NominalGuardProps) {
  const allowed = useCanViewNominal();
  return <>{allowed ? children : placeholder}</>;
}
