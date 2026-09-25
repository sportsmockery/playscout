-- Which opponent a SCOUTIQ result was scouting.
--
-- position_analysis_results records the team, the video and the module — never
-- the SUBJECT. For every other module that is fine, because the subject is the
-- coach's own team. SCOUTIQ is the exception: its subject is the opponent, and
-- the report route gathers evidence as "every SCOUTIQ result on the videos
-- tagged to this opponent".
--
-- That is safe only while a clip belongs to exactly one opponent, which is how
-- videos.opponent_id works today. The moment the same clip is scouted for a
-- SECOND opponent — which is the whole point of film of two opponents playing
-- each other — that clip carries two sets of results and nothing can tell them
-- apart. Team B's report would silently ingest team A's reads of the same
-- snaps as extra evidence: more clips, wrong team, no warning.
--
-- So the result carries its own subject, and scouting stops being a property
-- of the film row.

alter table public.position_analysis_results
  add column if not exists opponent_id uuid references public.opponents(id) on delete set null;

comment on column public.position_analysis_results.opponent_id is
  'SCOUTIQ only: which opponent this result was scouting. Null for every other module, whose subject is the coach''s own team.';

-- Backfill from the film's current tag. Correct for everything run before this
-- migration, because videos.opponent_id is a single column — a clip has only
-- ever had one opponent, so its existing SCOUTIQ results can only have been
-- about that one.
update public.position_analysis_results r
set opponent_id = v.opponent_id
from public.videos v
where r.video_id = v.id
  and r.module_key = 'SCOUTIQ'
  and r.opponent_id is null
  and v.opponent_id is not null;

-- The report route's query shape: results for one opponent, one module.
create index if not exists position_analysis_results_opponent_module_idx
  on public.position_analysis_results (opponent_id, module_key)
  where opponent_id is not null;
