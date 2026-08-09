-- Device push-notification tokens for the native mobile app.
--
-- No such table existed before mobile. Tokens are per-USER (a coach may sign in
-- on several devices), not per-team, so RLS scopes every row to its owner:
-- a user can only read/insert/update/delete their own tokens. Delivery of a
-- push must still re-check team access at send time — a token grants no data
-- access on its own.
--
-- The server upserts on (user_id, token) so re-registering the same device is
-- idempotent; sign-out / account deletion removes the row (client-driven, with
-- a server sweep as backstop).

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android')),
  device_name text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "Users manage their own push tokens" on public.push_tokens;
create policy "Users manage their own push tokens"
  on public.push_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
