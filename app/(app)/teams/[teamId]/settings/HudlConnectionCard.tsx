'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Lock, Loader2 } from 'lucide-react';

interface Status {
  connected: boolean;
  keyConfigured: boolean;
  email?: string;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  connectedAt?: string | null;
}

/**
 * Binds a team's Hudl account so PlayScout can pull their cut-ups unattended.
 *
 * The password is sent once and never comes back: there is no endpoint that
 * returns a stored credential, so re-entering it is the only way to change it.
 * That is deliberate, and the copy says so — a coach should be able to see
 * what they are agreeing to before they type it.
 */
export default function HudlConnectionCard({ teamId }: { teamId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Fetches without touching state, so the effect below can own the setState
  // and the connect/disconnect handlers can reuse the same request.
  const fetchStatus = useCallback(async (): Promise<Status | null> => {
    const res = await fetch(`/api/integrations/hudl?teamId=${teamId}`);
    if (!res.ok) return null;
    return (await res.json()) as Status;
  }, [teamId]);

  const apply = useCallback((next: Status | null) => {
    if (!next) return;
    setStatus(next);
    if (next.email) setEmail(next.email);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const next = await fetchStatus();
      if (!cancelled) apply(next);
    }
    tick();
    return () => {
      cancelled = true;
    };
  }, [fetchStatus, apply]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/integrations/hudl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the connection.');
      setPassword('');
      setSaved(true);
      apply(await fetchStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the connection.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fetch(`/api/integrations/hudl?teamId=${teamId}`, { method: 'DELETE' });
      setPassword('');
      setSaved(false);
      apply(await fetchStatus());
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <div className="glass-card rounded-2xl p-6 flex items-center gap-2 text-sm text-[var(--brand-muted)]">
        <Loader2 size={16} className="animate-spin" />
        Checking Hudl connection…
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Lock size={16} className="text-[var(--brand-navy)]" />
        <h2 className="font-bold text-[var(--brand-navy)]">Hudl Account</h2>
      </div>
      <p className="text-xs text-[var(--brand-muted)] mb-4">
        Connect the Hudl login you use for this team and PlayScout can pull a playlist of cut-ups
        straight into your film library. Your password is encrypted before it is stored, is used
        only to sign in to Hudl, and is never shown again — to change it, enter it again.
      </p>

      {!status.keyConfigured && (
        <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4 text-xs text-amber-800">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>
            Credential encryption is not configured on this deployment, so nothing can be saved yet.
            Set <code>HUDL_CREDENTIAL_KEY</code> on the web app and the worker.
          </span>
        </div>
      )}

      {status.connected && (
        <div className="rounded-lg border border-[var(--brand-border)] bg-white/60 p-3 mb-4 text-xs">
          <div className="flex items-center gap-2 font-semibold text-[var(--brand-ink)]">
            <CheckCircle2 size={15} className="text-green-600" />
            {status.email}
          </div>
          <p className="text-[var(--brand-muted)] mt-1">
            {status.lastVerifiedAt
              ? `Last signed in ${new Date(status.lastVerifiedAt).toLocaleString()}.`
              : 'Not verified yet — the first import proves the login works.'}
          </p>
          {status.lastError && (
            <p className="text-amber-700 mt-1.5 flex gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {status.lastError}
            </p>
          )}
        </div>
      )}

      <form onSubmit={connect} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
            Hudl email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            placeholder="coach@example.com"
            className="w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
            Hudl password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={status.connected ? 'Enter again to replace' : ''}
            className="w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {saved && (
          <p className="text-xs text-green-700">
            Saved. PlayScout will sign in on your next Hudl import — if the login is wrong, that
            import will say so.
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={busy || !email.trim() || !password || !status.keyConfigured}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-[var(--brand-navy)] text-white disabled:opacity-40 transition-opacity"
          >
            {status.connected ? 'Update connection' : 'Connect Hudl'}
          </button>
          {status.connected && (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-[var(--brand-border)] text-[var(--brand-ink)] hover:bg-[var(--brand-bg)] disabled:opacity-40 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
        {status.connected && (
          <p className="text-[11px] text-[var(--brand-muted)]">
            Disconnecting deletes the stored login and stops every future import for this team.
          </p>
        )}
      </form>
    </div>
  );
}
