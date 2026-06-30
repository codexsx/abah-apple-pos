// Feature: role-based-access
import { type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessFinance } from '@/services/accessCore';

/** Boss-only route guard: blocks Staff from finance pages (Req 2.1-2.3). */
export default function FinanceRoute({ children }: { children: ReactNode }) {
  const { profile, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }
  if (!canAccessFinance(profile?.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
