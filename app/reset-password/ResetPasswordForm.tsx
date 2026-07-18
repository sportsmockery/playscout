'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';

type Stage = 'verifying' | 'ready' | 'invalid' | 'done';

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();

  const [stage, setStage] = useState<Stage>('verifying');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function verify() {
      const code = searchParams.get('code');

      // The reset link either lands here with an exchangeable ?code=... (PKCE
      // flow) or has already left the browser in an active recovery session
      // via the #access_token hash (implicit flow, handled by the client
      // library on load). Either way, confirm a session actually exists
      // before letting the coach set a new password.
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setStage('invalid');
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      setStage(session ? 'ready' : 'invalid');
    }

    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setStage('done');
    setTimeout(() => {
      router.push('/dashboard');
      router.refresh();
    }, 1500);
  }

  const inputClass =
    'w-full px-4 py-3 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all placeholder:text-[var(--brand-muted)]';

  if (stage === 'verifying') {
    return (
      <div className="flex justify-center py-8">
        <span className="w-6 h-6 border-2 border-[var(--brand-border)] border-t-[var(--brand-navy)] rounded-full animate-spin" />
      </div>
    );
  }

  if (stage === 'invalid') {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-3 mb-4">
          This reset link is invalid or has expired.
        </p>
        <a href="/forgot-password" className="text-sm font-semibold text-[var(--brand-navy)] hover:underline">
          Request a new link
        </a>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="text-center py-4">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={22} className="text-emerald-600" />
        </div>
        <p className="font-semibold text-[var(--brand-ink)] mb-1">Password updated</p>
        <p className="text-sm text-[var(--brand-muted)]">Taking you to your dashboard...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
          New password
        </label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputClass} pr-11`}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand-muted)] hover:text-[var(--brand-ink)] transition-colors"
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
          Confirm new password
        </label>
        <input
          type={showPw ? 'text' : 'password'}
          required
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
          autoComplete="new-password"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          'Update password'
        )}
      </button>
    </form>
  );
}
