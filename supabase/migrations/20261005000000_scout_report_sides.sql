-- A scouting report is two reports: the opponent ON OFFENSE (what our defense
-- plans against) and ON DEFENSE (what our offense attacks). Each half's charted
-- evidence is kept so the saved report renders both without recomputing.
-- Nullable: every report saved before this has neither, and still renders.
alter table public.scout_reports
  add column if not exists offense_scout jsonb,
  add column if not exists defense_scout jsonb;
