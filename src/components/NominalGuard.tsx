// Feature: role-based-access
import { type ReactNode } from 'react';
import { useCanViewNominal } from '@/hooks/useCanViewNominal';

export interface NominalGuardProps {
  children: ReactNode;
  placeholder?: ReactNode;
}

export default function NominalGuard({ children, placeholder = '••••' }: NominalGuardProps) {
  const allowed = useCanViewNominal();
  return <>{allowed ? children : placeholder}</>;
}
