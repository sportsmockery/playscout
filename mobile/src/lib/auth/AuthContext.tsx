import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, registerSupabaseAppStateRefresh } from '@/lib/supabase/client';
import { unregisterCurrentPushToken } from '@/lib/notifications/pushTokens';
import { clearUploadPersistence } from '@/stores/uploadStore';

interface AuthState {
  status: 'loading' | 'signedIn' | 'signedOut';
  session: Session | null;
  user: User | null;
  /** Email + password sign-in — the same method the web app uses. Invite-only:
   * there is no sign-up on mobile. */
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Sends a password-reset email (handled by the web reset flow). */
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    registerSupabaseAppStateRefresh();

    // Restore any persisted session before the app decides on protected nav.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted.current) return;
      setSession(data.session);
      setStatus(data.session ? 'signedIn' : 'signedOut');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted.current) return;
      setSession(next);
      setStatus(next ? 'signedIn' : 'signedOut');
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      async signInWithPassword(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        return { error: error?.message ?? null };
      },
      async sendPasswordReset(email: string) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
        return { error: error?.message ?? null };
      },
      async signOut() {
        // Best-effort: detach this device's push token first so old pushes go
        // stale, then tear down all local state.
        await unregisterCurrentPushToken().catch(() => {});
        await supabase.auth.signOut().catch(() => {});
        await clearUploadPersistence().catch(() => {});
        queryClient.clear();
      },
    }),
    [status, session, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
