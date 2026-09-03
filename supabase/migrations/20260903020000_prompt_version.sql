-- 20260903020000_prompt_version.sql
--
-- Make a coach's correction traceable to the prompt that caused it.
--
-- output_corrections has carried a prompt_version column since migration 024,
-- described there as the correction flywheel's training data. Neither writer
-- ever set it, so every correction ever recorded is unattributable: you cannot
-- ask whether a prompt change fixed a class of mistake, because you cannot
-- tell which corrections came from which prompt.
--
-- The version has to be recorded where it is KNOWN — at analysis time, when
-- the prompt actually exists. The correction routes then copy it off the row
-- they are correcting, rather than trying to reconstruct a prompt that may
-- since have changed.

alter table public.position_analysis_results
  add column if not exists prompt_version text;

alter table public.playbook_plays
  add column if not exists prompt_version text;

create index if not exists output_corrections_prompt_version_idx
  on public.output_corrections (prompt_version, field);
