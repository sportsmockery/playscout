-- 015_teams_home_away_jersey_colors.sql
-- Jersey colors flip by game (home vs. away), so a single jersey_color
-- field can't correctly identify the team across different videos. Split
-- into home/away; the coach picks which applies when running analysis on
-- a specific video, and the client resolves that choice into a single
-- jersey_color string sent to the AI.

alter table public.teams rename column jersey_color to home_jersey_color;
alter table public.teams add column away_jersey_color text;
