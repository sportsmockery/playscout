-- Raise the videos bucket file-size limit to fit a full 90-minute game film.
-- The bucket was created without an explicit file_size_limit, so it inherited
-- the project global limit. Pin it at 12GB to match MAX_FILE_BYTES in
-- components/upload/UploadDockProvider.tsx.
-- NOTE: Supabase enforces min(bucket limit, project global limit); the global
-- limit (Dashboard -> Storage -> Settings) must also be >=12GB.
update storage.buckets
set file_size_limit = 12884901888  -- 12 GiB (12 * 1024^3)
where id = 'videos';
