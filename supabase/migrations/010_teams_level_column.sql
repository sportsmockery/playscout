-- 010_teams_level_column.sql
-- The team-creation UI has always collected a competitive level
-- (Recreation/Travel/High School/...) but the column never existed,
-- so every insert failed. Add it to match the existing UI.

alter table public.teams add column level text;
