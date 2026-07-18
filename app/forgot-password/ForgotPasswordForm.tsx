'use client';

import { useState } from 'react';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { Mail } from 'lucide-react';

export default function ForgotPasswordForm() {
  const supabase = createBrowserClient();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    // Always show the same confirmation whether or not the email exists —
    // otherwise this form becomes a way to enumerate registered coaches.
    if (resetError && resetError.status && resetError.status >= 500) {
      setError('Something went wrong sending the reset link. Please try again.');
      return;
    }

    setSent(true);
  }

  const inputClass =
    'w-full px-4 py-3 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all placeholder:text-[var(--brand-muted)]';

  if (sent) {
    return (
      <div className="text-center py-4">
        <div className="w-12 h-12 rounded-full bg-[var(--brand-navy)]/10 flex items-center justify-center mx-auto mb-4">
          <Mail size={22} className="text-[var(--brand-navy)]" />
        </div>
        <p className="font-semibold text-[var(--brand-ink)] mb-1">Check your email</p>
        <p className="text-sm text-[var(--brand-muted)]">
          If an account exists for <span className="font-medium text-[var(--brand-ink)]">{email}</span>, a
          password reset link is on its way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          'Send reset link'
        )}
      </button>
    </form>
  );
}
