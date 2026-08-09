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
  /** Request an email OTP (6-digit code). No open signup: unknown emails simply
   * never receive a code, matching the web's invite-only posture. */
  requestEmailOtp: (email: string) => Promise<{ error: string | null }>;
  verifyEmailOtp: (email: string, token: string) => Promise<{ error: string | null }>;
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
      async requestEmailOtp(email: string) {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { shouldCreateUser: false },
        });
        return { error: error?.message ?? null };
      },
      async verifyEmailOtp(email: string, token: string) {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: token.trim(),
          type: 'email',
        });
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
