import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, getProfile, signIn as authSignIn, signOut as authSignOut, type AuthProfile } from '@/services/auth';

interface AuthContextType {
  user: User | null;
  profile: AuthProfile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string, email?: string) => {
    const profileData = await getProfile(userId);
    if (profileData && email) {
      profileData.email = email;
    }
    setProfile(profileData);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const currentUser = await getCurrentUser();
        if (!mounted) return;
        setUser(currentUser);
        if (currentUser) {
          await loadProfile(currentUser.id, currentUser.email);
        }
      } catch (err) {
        console.error('[AuthProvider] init error:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        await loadProfile(nextUser.id, nextUser.email);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: signedInUser } = await authSignIn(email, password);
    setUser(signedInUser);
    if (signedInUser) {
      await loadProfile(signedInUser.id, signedInUser.email);
    }
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await authSignOut();
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.id, user.email ?? undefined);
    }
  }, [user, loadProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, isLoading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
