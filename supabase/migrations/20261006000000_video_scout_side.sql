-- The coach's own call on which side of the ball the scouted opponent is on in
-- a clip: 'offense' (they have the ball) or 'defense'. Null means untagged, and
-- the model's possession read is used as before.
--
-- Exists because the model's read was wrong on a whole game where both teams
-- ran the same formation — while the coach can tell at a glance. A tag
-- overrides every model read, both in the game plan and when the clip is
-- re-scouted.
alter table public.videos
  add column if not exists scout_side text
    check (scout_side in ('offense', 'defense'));
