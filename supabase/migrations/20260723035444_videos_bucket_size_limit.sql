-- Raise the videos bucket file-size limit to fit a full 90-minute game film.
--
-- The videos bucket (003_storage.sql) was created without an explicit
-- file_size_limit, so it silently inherited the project's global storage
-- limit. Pin it here at 12GB so a single long game (~90 min of 1080p film)
-- uploads without hitting a surprise ceiling, matching MAX_FILE_BYTES in
-- components/upload/UploadDockProvider.tsx.
--
-- IMPORTANT: Supabase enforces the *smaller* of a bucket's file_size_limit and
-- the project-wide global limit (Dashboard → Storage → Settings). This bucket
-- setting only takes effect if that global limit is also at least 12GB —
-- otherwise large uploads are still rejected server-side regardless of this.

update storage.buckets
set file_size_limit = 12884901888  -- 12 GiB (12 * 1024^3)
where id = 'videos';
