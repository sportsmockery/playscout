'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Lock, Loader2, KeyRound, ClipboardPaste } from 'lucide-react';
import { normalizeHudlSessionPaste } from '@/lib/import/hudl-session-paste';

type AuthMode = 'password' | 'session';

interface Status {
  connected: boolean;
  keyConfigured: boolean;
  email?: string;
  authMode?: AuthMode;
  lastVerifiedAt?: string | null;
  sessionExpiresAt?: string | null;
  sessionPastedAt?: string | null;
  lastError?: string | null;
  connectedAt?: string | null;
  verifying?: boolean;
}

/** How often to re-ask while a connection test is running on the worker. */
const VERIFY_POLL_MS = 3000;

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-white text-sm text-[var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]';

function when(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

/**
 * Binds a team's Hudl account so PlayScout can pull their cut-ups unattended.
 *
 * There are two ways in, because there have to be:
 *
 *   Password — PlayScout signs in itself, forever, unattended. The better deal
 *     when the account has a password.
 *   Pasted session — the coach hands over the session their own browser holds.
 *     This is the ONLY option for an account that signs in with Google: it has
 *     no Hudl password, and Google blocks automated browsers, so driving that
 *     sign-in would put the coach's Google account at risk rather than simply
 *     failing. The trade is that the session expires and has to be re-pasted.
 *
 * Neither secret ever comes back: no endpoint returns a stored password or
 * session, so replacing one means entering it again. That is deliberate, and
 * the copy says so — a coach should be able to see what they are agreeing to
 * before they type it.
 */
export default function HudlConnectionCard({ teamId }: { teamId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<AuthMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [testing, setTesting] = useState(false);
  /** Verified-at as it was when a test started, so a change means an answer. */
  const verifiedBefore = useRef<string | null>(null);

  const fetchStatus = useCallback(async (): Promise<Status | null> => {
    const res = await fetch(`/api/integrations/hudl?teamId=${teamId}`);
    if (!res.ok) return null;
    return (await res.json()) as Status;
  }, [teamId]);

  const apply = useCallback((next: Status | null) => {
    if (!next) return;
    setStatus(next);
    if (next.email) setEmail(next.email);
    if (next.authMode) setMode(next.authMode);
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

  // A test runs on the Railway worker, not here, so the only way to learn the
  // answer is to keep asking. Polling stops as soon as the job leaves the
  // queue — which also covers a reload mid-test, since `verifying` is read
  // from the job table rather than from this component's state.
  const live = testing || status?.verifying === true;
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      const next = await fetchStatus();
      if (cancelled || !next) return;
      apply(next);
      if (!next.verifying) {
        setTesting(false);
        if (next.lastError) setError(next.lastError);
        else if (next.lastVerifiedAt && next.lastVerifiedAt !== verifiedBefore.current) {
          setSaved('Signed in to Hudl successfully. Imports for this team will work.');
        }
      }
    }, VERIFY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, fetchStatus, apply]);

  // Runs on every keystroke so a bad paste is caught before it is sent — the
  // same function the API route refuses it with.
  const paste = useMemo(
    () => (session.trim() ? normalizeHudlSessionPaste(session) : null),
    [session]
  );

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const res = await fetch('/api/integrations/hudl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'password'
            ? { teamId, email: email.trim(), password }
            : { teamId, email: email.trim(), session }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the connection.');
      setPassword('');
      setSession('');
      setSaved(
        mode === 'session'
          ? `Saved ${data.cookiesStored} Hudl cookie${data.cookiesStored === 1 ? '' : 's'}` +
              (data.cookiesDropped
                ? `, and discarded ${data.cookiesDropped} from other sites.`
                : '.') +
              ' Test the connection to confirm Hudl accepts it.'
          : 'Saved. Test the connection to confirm Hudl accepts it.'
      );
      apply(await fetchStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the connection.');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (busy || testing) return;
    setBusy(true);
    setError('');
    setSaved('');
    verifiedBefore.current = status?.lastVerifiedAt ?? null;
    try {
      const res = await fetch('/api/integrations/hudl/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start the connection test.');
      setTesting(true);
      apply(await fetchStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the connection test.');
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
      setSession('');
      setSaved('');
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

  const canSubmit =
    Boolean(email.trim()) &&
    status.keyConfigured &&
    (mode === 'password' ? Boolean(password) : paste?.ok === true);

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Lock size={16} className="text-[var(--brand-navy)]" />
        <h2 className="font-bold text-[var(--brand-navy)]">Hudl Account</h2>
      </div>
      <p className="text-xs text-[var(--brand-muted)] mb-4">
        Connect the Hudl account you use for this team and PlayScout can pull a playlist of cut-ups
        straight into your film library. Whatever you enter is encrypted before it is stored, is
        used only to reach Hudl, and is never shown again — to change it, enter it again.
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
            {status.authMode === 'session'
              ? `Using a Hudl session you pasted${
                  when(status.sessionPastedAt) ? ` on ${when(status.sessionPastedAt)}` : ''
                }. There is no password stored for this account.`
              : 'PlayScout signs in with the stored password.'}
          </p>
          <p className="text-[var(--brand-muted)] mt-1">
            {status.lastVerifiedAt
              ? `Last signed in ${new Date(status.lastVerifiedAt).toLocaleString()}.`
              : 'Not verified yet — test the connection, or the first import will prove it.'}
          </p>
          {status.authMode === 'session' && when(status.sessionExpiresAt) && (
            <p className="text-[var(--brand-muted)] mt-1">
              The session expires around {when(status.sessionExpiresAt)}. Every successful import
              refreshes it; once it lapses you paste a new one.
            </p>
          )}
          {status.lastError && (
            <p className="text-amber-700 mt-1.5 flex gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {status.lastError}
            </p>
          )}

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={test}
              disabled={busy || live || !status.keyConfigured}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--brand-border)] text-[var(--brand-ink)] hover:bg-[var(--brand-bg)] disabled:opacity-40 transition-colors"
            >
              {live ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {live ? 'Signing in to Hudl…' : 'Test connection'}
            </button>
            {live && (
              <span className="text-[11px] text-[var(--brand-muted)]">
                Takes up to a minute — the film worker does the signing in.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Which kind of connection. Shown before the fields, because the answer
          decides what a coach is being asked for — and for a Google account,
          "Hudl password" is a field they cannot fill in and should not be
          staring at with no explanation. */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--brand-bg)] mb-4">
        {(
          [
            { key: 'password' as const, label: 'Hudl password', icon: KeyRound },
            { key: 'session' as const, label: 'Paste session', icon: ClipboardPaste },
          ]
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMode(key);
              setError('');
              setSaved('');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md transition-colors ${
              mode === key
                ? 'bg-white text-[var(--brand-navy)] shadow-sm'
                : 'text-[var(--brand-muted)] hover:text-[var(--brand-ink)]'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

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
            className={inputClass}
          />
        </div>

        {mode === 'password' ? (
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
              className={inputClass}
            />
            <p className="text-[11px] text-[var(--brand-muted)] mt-1.5">
              If you sign in to Hudl with Google, this account has no password. Either set one
              (Hudl &rarr; Account &rarr; Password, or &ldquo;Forgot password&rdquo;) and enter it
              here, or use <strong>Paste session</strong> instead.
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-[var(--brand-ink)] mb-1.5">
              Hudl session export
            </label>
            <textarea
              value={session}
              onChange={(e) => setSession(e.target.value)}
              rows={4}
              spellCheck={false}
              placeholder='[{"domain":".hudl.com","name":"…","value":"…"}, …]'
              className={`${inputClass} font-mono text-[11px] resize-y`}
            />

            {paste && !paste.ok && <p className="text-xs text-amber-700 mt-1.5">{paste.reason}</p>}
            {paste?.ok && (
              <p className="text-xs text-green-700 mt-1.5">
                {paste.cookieCount} Hudl cookie{paste.cookieCount === 1 ? '' : 's'} read
                {paste.droppedCount
                  ? `. ${paste.droppedCount} cookie${paste.droppedCount === 1 ? '' : 's'} from other sites will be discarded — PlayScout stores hudl.com only.`
                  : '.'}
              </p>
            )}

            <div className="rounded-lg bg-[var(--brand-bg)] border border-[var(--brand-border)] p-3 mt-2 text-[11px] text-[var(--brand-muted)] space-y-1">
              <p className="font-semibold text-[var(--brand-ink)]">
                For accounts that sign in with Google. Needs a desktop browser.
              </p>
              <p>
                1. Sign in to Hudl in Chrome as you normally do, and open any Hudl page.
              </p>
              <p>
                2. Add a cookie-editor extension, open it on that tab, and press{' '}
                <strong>Export</strong> (JSON).
              </p>
              <p>3. Paste the whole thing above.</p>
              <p className="pt-1">
                Only hudl.com cookies are kept — anything else in the export is thrown away before
                it is stored. The session works until Hudl expires it, and every successful import
                refreshes it. Signing out of Hudl everywhere revokes it immediately.
              </p>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
        {saved && <p className="text-xs text-green-700">{saved}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={busy || !canSubmit}
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
