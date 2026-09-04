-- 20260904000000_scout_attack_points.sql
--
-- Keep the part of a scout report a coach actually asks for.
--
-- attack_points — the ways to attack this opponent — were aggregated across
-- every clip, handed to the game-plan prompt (scoutiq-gameplan.ts:57), and then
-- dropped. scout_reports had no column for them and the insert never set one.
-- Only the model's narrative survived, so the underlying evidence, and the
-- count of how many clips each point appeared in, was gone the moment the
-- report was written.
--
-- Stored as jsonb rather than a table: a scout report is a snapshot recomputed
-- fresh each time, not a set of rows anything joins against.
alter table public.scout_reports
  add column if not exists attack_points jsonb;
