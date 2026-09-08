-- The opponent's jersey colour is what anchors a scouting report to one team.
--
-- It existed only as React state on the ScoutIQ screen: typed fresh on every
-- visit, blank after a reload, and gating nothing. A batch queued from a fresh
-- page load therefore ran every clip through SCOUTIQ's unconfirmed-subject
-- branch, which tells the model it cannot confirm who it is watching and to
-- lower its confidence accordingly.
--
-- That matters most in the case the product is for: scouting a future opponent
-- off their game against a third team, where the coach's own team is not on the
-- film at all and cannot be used to tell the sides apart.
alter table public.opponents
  add column if not exists jersey_color text;

comment on column public.opponents.jersey_color is
  'What this opponent wears, in the coach''s words ("blue jerseys, white helmets"). Used to anchor which side SCOUTIQ grades.';
