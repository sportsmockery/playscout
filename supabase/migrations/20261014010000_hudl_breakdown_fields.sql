-- Every column of a Hudl breakdown gets a real field, so a clip's PLAY #, QTR,
-- OFF STR, BACKFIELD, DEF STR, BLITZ, COVERAGE and EFF can be filtered and fed
-- to the modules instead of living only in the `breakdown` jsonb catch-all.
alter table public.play_sequences
  add column if not exists play_number int,
  add column if not exists quarter int,
  add column if not exists offensive_strength text,
  add column if not exists backfield text,
  add column if not exists defensive_strength text,
  add column if not exists blitz text,
  add column if not exists coverage text,
  add column if not exists efficiency text;

-- Import only the first N clips of a playlist (a coach who wants plays 1-104
-- of a 131-clip game). Also what keeps a re-scan of that game from pulling
-- the clips they removed back in.
alter table public.hudl_import_jobs
  add column if not exists clip_limit int check (clip_limit is null or clip_limit > 0);

-- How many clips an import found a breakdown for, beside comments_found.
alter table public.hudl_import_jobs
  add column if not exists breakdowns_found int;
