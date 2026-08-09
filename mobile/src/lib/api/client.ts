import { supabase } from '@/lib/supabase/client';
import { config } from '@/lib/config';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  /** Multipart body (uploads) — sent as-is, Content-Type left to the platform. */
  form?: FormData;
  signal?: AbortSignal;
}

/**
 * Authenticated JSON request against the PlayScout API. Attaches the Supabase
 * access token as a Bearer header (the server verifies it via getUser()).
 * Normalizes both `{ error }` JSON and plain-text error bodies into ApiError,
 * so no raw stack trace or provider detail reaches the UI.
 */
export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = await accessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!opts.form) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${config.apiUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.form ? opts.form : opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new ApiError(await extractError(res), res.status);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function extractError(res: Response): Promise<string> {
  const fallback =
    res.status === 401
      ? 'Your session has expired. Please sign in again.'
      : res.status === 403
        ? 'You do not have permission to do that.'
        : res.status === 429
          ? 'Too many requests. Please wait a moment and try again.'
          : 'Something went wrong. Please try again.';
  try {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const body = (await res.json()) as { error?: string };
      return body.error ?? fallback;
    }
    const text = (await res.text()).trim();
    // Never surface a giant HTML error page or stack trace.
    if (text && text.length < 300 && !text.startsWith('<')) return text;
  } catch {
    // ignore
  }
  return fallback;
}

/** Absolute URL + auth header for streaming/TUS clients that need them. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function apiUrl(path: string): string {
  return `${config.apiUrl}${path}`;
}
