// Feature: user-management — per-feature route guard
//
// Generic route guard that blocks access to a feature route unless the current
// profile has the effective permission for `permission`. MANAJER always passes;
// other roles fall back to ROLE_DEFAULTS unless a per-user override is set
// (see permissionsCore.effectivePermission). Fail-closed: an unknown role or a
// missing profile is denied and redirected home.
import { type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { effectivePermission, type PermissionKey } from '@/services/permissionsCore';

export default function PermissionRoute({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (!effectivePermission(profile?.role, profile?.permissions, permission)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
