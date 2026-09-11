-- 20260911000000_hudl_session_auth.sql
--
-- Two additions, both in service of Hudl accounts that sign in with Google.
--
-- 1. A connection can now be a PASTED SESSION instead of a password.
--
--    PlayScout signs in to Hudl by driving a headless browser, which needs a
--    Hudl password. An account that signs in with Google has none, and Google
--    blocks automated browsers outright — attempting that sign-in would risk
--    the coach's Google account rather than merely failing. So those coaches
--    hand over the session their own browser already holds and the worker
--    restores it, exactly as it already restores a session it cached itself.
--
--    `sealed_password` therefore becomes nullable, and `auth_mode` records
--    which kind of connection this is. `auth_mode` is deliberately a column
--    rather than something derived from "is sealed_password null": the status
--    route must be able to answer it WITHOUT selecting a sealed column, so
--    that no future edit to that route's field list can leak one.
--
-- 2. A connection can be TESTED before an import depends on it.
--
--    Binding an account wrote a row and said "saved". Whether Hudl would
--    actually accept it was discovered by the first import, hours later — and
--    for a Google account the answer was always no. `hudl_import_jobs` gains a
--    `job_kind`, so a sign-in-only job rides the same claim/lock/reap
--    machinery as an import and reports back in under a minute.

-- ---------------------------------------------------------------------------
-- 1. Session-based connections
-- ---------------------------------------------------------------------------

alter table public.hudl_credentials
  alter column sealed_password drop not null;

alter table public.hudl_credentials
  add column if not exists auth_mode text not null default 'password';

alter table public.hudl_credentials
  add column if not exists session_pasted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hudl_credentials_auth_mode_check'
  ) then
    alter table public.hudl_credentials
      add constraint hudl_credentials_auth_mode_check
      check (auth_mode in ('password', 'session'));
  end if;
end $$;

-- A row that carries neither a password nor a session is a connection that can
-- never sign in, and it would fail at the far end of a twenty-minute job
-- instead of here. Enforced in the database because both the bind route and
-- the worker read this table and only one of them writes it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hudl_credentials_has_a_secret_check'
  ) then
    alter table public.hudl_credentials
      add constraint hudl_credentials_has_a_secret_check
      check (
        (auth_mode = 'password' and sealed_password is not null)
        or (auth_mode = 'session' and sealed_session is not null)
      );
  end if;
end $$;

comment on column public.hudl_credentials.auth_mode is
  'password = PlayScout signs in with the stored password. session = the coach pasted their own browser session (Google/SSO accounts, which have no password to give). Non-secret on purpose: the status route reports it without selecting a sealed column.';

comment on column public.hudl_credentials.session_pasted_at is
  'When a session was last pasted by hand. A pasted session is refreshed on every successful job, so this is the age of the ORIGINAL paste — what tells a coach whether re-pasting is the fix.';

-- ---------------------------------------------------------------------------
-- 2. Sign-in-only jobs
-- ---------------------------------------------------------------------------

alter table public.hudl_import_jobs
  add column if not exists job_kind text not null default 'import';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hudl_import_jobs_job_kind_check'
  ) then
    alter table public.hudl_import_jobs
      add constraint hudl_import_jobs_job_kind_check
      check (job_kind in ('import', 'verify'));
  end if;
end $$;

-- A verify job has no playlist to point at. Rather than storing a fake URL,
-- the column becomes nullable and the constraint says which kind needs one.
alter table public.hudl_import_jobs
  alter column source_url drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hudl_import_jobs_import_has_url_check'
  ) then
    alter table public.hudl_import_jobs
      add constraint hudl_import_jobs_import_has_url_check
      check (job_kind <> 'import' or source_url is not null);
  end if;
end $$;

comment on column public.hudl_import_jobs.job_kind is
  'import = pull a playlist. verify = sign in and report back, nothing else. A verify job uses target_key ''verify'', so the existing active-target unique index already limits a team to one live verification at a time.';
