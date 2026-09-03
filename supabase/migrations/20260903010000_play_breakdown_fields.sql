-- 20260903010000_play_breakdown_fields.sql
--
-- Somewhere for a coach's breakdown data to land.
--
-- play_sequences held only down, distance, yard_line, result and coach_label,
-- and PositionAnalysisInputSchema exposed even less. So the module prompts ask
-- the model to INFER the situation — formation, play type, direction — from
-- the film, when the staff already tagged all of it in Hudl. Feeding tagged
-- facts back in removes a whole class of guessing, and lets TEAMIQ/SCOUTIQ
-- count tendencies from what was recorded rather than from what a model
-- thought it saw.

alter table public.play_sequences
  -- Which unit was on the field. Decides whose tendencies a clip contributes to.
  add column if not exists odk text check (odk is null or odk in ('O', 'D', 'K')),
  add column if not exists hash text check (hash is null or hash in ('L', 'M', 'R')),
  add column if not exists offensive_formation text,
  add column if not exists defensive_front text,
  add column if not exists play_type text,
  add column if not exists play_direction text,
  add column if not exists play_name text,
  add column if not exists gain_loss int,
  -- Columns we don't map. An unrecognised column is still the coach's data,
  -- and a staff's own tagging vocabulary is worth keeping even when we cannot
  -- interpret it yet.
  add column if not exists breakdown jsonb,
  -- Position in the source export. Clips are matched to breakdown rows in
  -- order, so this is what a coach's correction on the reconciliation screen
  -- is anchored to.
  add column if not exists source_row_index int;

create index if not exists play_sequences_video_row_idx
  on public.play_sequences (video_id, source_row_index);
