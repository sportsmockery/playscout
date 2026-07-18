-- 016_storage_team_scoping.sql
--
-- Fixes a cross-tenant data leak: storage RLS on the videos/frames/playbooks
-- buckets only checked `auth.role() = 'authenticated'`, never the requester's
-- team membership, even though every object is stored under a `${teamId}/...`
-- path. Any logged-in coach could read (and write/overwrite) any other
-- team's private game film, extracted frames, and playbooks.
--
-- Fix: scope every policy by the team id encoded in the object path, using
-- the existing `can_access_team()` helper already used to gate the `teams`
-- table itself.

-- Drop the old, bucket-only-scoped policies.
drop policy if exists "Authenticated users can upload videos" on storage.objects;
drop policy if exists "Authenticated users can update videos" on storage.objects;
drop policy if exists "Team members can read videos" on storage.objects;
drop policy if exists "auth_playbooks_storage" on storage.objects;

-- The `thumbnails` bucket is a public bucket (public = true) — Supabase
-- serves individual objects via public CDN URL without consulting RLS at
-- all, so this policy was never needed for `getPublicUrl()` reads. Its only
-- live effect was allowing any authenticated client to LIST every thumbnail
-- object in the bucket (flagged by the Supabase security advisor). Dropping
-- it removes the listing capability with zero effect on thumbnail display.
drop policy if exists "Public thumbnails" on storage.objects;

-- Team-scoped policies for the three private, team-owned buckets. Path
-- convention (see UploadVideoButton.tsx, workers/process-video.ts,
-- app/api/playbookiq/upload/route.ts) is always `${teamId}/...` — the first
-- path segment. We validate it looks like a uuid before casting, so a
-- malformed/legacy object path fails closed instead of erroring the query.
create policy "Team members can read team files"
  on storage.objects for select
  using (
    bucket_id = any (array['videos', 'frames', 'playbooks'])
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.can_access_team(((storage.foldername(name))[1])::uuid)
  );

create policy "Team members can upload team files"
  on storage.objects for insert
  with check (
    bucket_id = any (array['videos', 'frames', 'playbooks'])
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.can_access_team(((storage.foldername(name))[1])::uuid)
  );

create policy "Team members can update team files"
  on storage.objects for update
  using (
    bucket_id = any (array['videos', 'frames', 'playbooks'])
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.can_access_team(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = any (array['videos', 'frames', 'playbooks'])
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.can_access_team(((storage.foldername(name))[1])::uuid)
  );

create policy "Team members can delete team files"
  on storage.objects for delete
  using (
    bucket_id = any (array['videos', 'frames', 'playbooks'])
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.can_access_team(((storage.foldername(name))[1])::uuid)
  );
