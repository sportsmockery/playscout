'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { Eye, EyeOff, UserPlus } from 'lucide-react';

export default function RegisterForm() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  const inputClass =
    'w-full px-4 py-3 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all placeholder:text-[var(--brand-muted)]';

  if (success) {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-bold text-[var(--brand-navy)] text-lg mb-2">Check your email</h3>
        <p className="text-sm text-[var(--brand-muted)] leading-relaxed">
          We sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
          Full Name
        </label>
        <input
          type="text"
          required
          placeholder="Coach name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          autoComplete="name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
          Email
        </label>
        <input
          type="email"
          required
          placeholder="coach@yourteam.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          autoComplete="email"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
          Password
        </label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            required
            minLength={8}
            placeholder="Min. 8 characters"
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
          <>
            <UserPlus size={18} />
            Create account
          </>
        )}
      </button>

      <p className="text-xs text-[var(--brand-muted)] text-center leading-relaxed">
        By creating an account you agree to our{' '}
        <a href="/terms" className="underline">Terms of Service</a>{' '}
        and{' '}
        <a href="/privacy" className="underline">Privacy Policy</a>.
      </p>
    </form>
  );
}
