-- 20260907230000_players_grade_and_status.sql
--
-- `players.grade_level` and `players.status` were never created.
--
-- Migration 001 defines neither, nothing alters the table afterwards, and yet
-- both are declared on the Player type (lib/db/types.ts) and used in four
-- places that read or write them: the add-player form, the edit form, the
-- roster table, and the mobile roster API. Adding a player therefore failed
-- outright with "Could not find the 'grade_level' column of 'players' in the
-- schema cache" — the feature shipped without its migration.
--
-- Worth noting what else this blocked: per the RankerIQ rules, a jersey number
-- requires a roster to check against, and no roster could be entered at all.
-- Player-level grading was unreachable for want of two columns.

alter table public.players
  -- Free text, not an enum: "8th", "Freshman", "2030" and "5th grade" are all
  -- things a coach legitimately types, and the readers all treat it as a label
  -- (`grade_level ?? '—'`) rather than something to compare.
  add column if not exists grade_level text,
  -- Roster status — active, injured, moved. Same story: displayed, not
  -- branched on, so a check constraint would only reject a coach's vocabulary.
  add column if not exists status text;
