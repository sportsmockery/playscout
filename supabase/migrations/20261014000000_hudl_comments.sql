-- Comments and notes the coaching staff left on a clip in Hudl, carried over
-- by the Hudl import. A list of { kind, text, author?, postedAt?, clipSeconds? }.
alter table public.play_sequences
  add column if not exists hudl_comments jsonb;

-- How many comments/notes an import found, so "none came through" is visible
-- on the job rather than inferred from an empty film page.
alter table public.hudl_import_jobs
  add column if not exists comments_found int;
