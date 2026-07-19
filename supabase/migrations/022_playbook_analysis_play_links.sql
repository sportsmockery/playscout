-- 022_playbook_analysis_play_links.sql
--
-- playbook_analyses (whole-book scores/strengths/weaknesses) and
-- playbook_plays (per-play assignments) are two independent AI passes over
-- the same playbook_id with no stored link between them. Adds
-- covered_play_ids so a whole-book analysis can list exactly which plays it
-- covers (and a per-play card can point back to its analysis) without
-- inferring it from playbook_id alone.

alter table public.playbook_analyses
  add column if not exists covered_play_ids uuid[] not null default '{}';
