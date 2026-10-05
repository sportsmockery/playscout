-- Clips a coach has taken out of scouting — typically the backups' pre-game
-- scrimmage at the start of a whole-game cut-up, which is real football by
-- the wrong players and would put their tendencies in the starters' report.
-- Excluded clips are not selectable on the ScoutIQ screen and are left out of
-- every scouting report. Default false, so existing film is unaffected.
alter table public.videos
  add column if not exists scout_excluded boolean not null default false;
