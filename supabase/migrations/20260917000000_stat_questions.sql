-- 20260917000000_stat_questions.sql
--
-- Let a charted stat be UNRESOLVED, and let a coach enter one by hand.
--
-- The first version of StatsIQ had no way to say "I don't know who that was",
-- so the model picked — and picked wrong on the very first real play, putting a
-- quarterback's 55-yard touchdown on a running back. A coach then has to notice
-- the error, find it, and fix it, which is the wrong order: the model knew at
-- charting time that it could not see the mesh point, and that is the moment to
-- ask rather than the moment to guess.
--
-- So a credit now carries its own resolution state:
--   confirmed     — the film showed it. Counts.
--   unresolved    — something happened and we do not know who did it. Does NOT
--                   count, and becomes a question in the coach's queue.
--   coach_entered — the coach typed it. Counts, and outranks anything the model
--                   said, because they were there.
--
-- An unresolved credit is deliberately still a ROW rather than a note: the play
-- did happen, the yardage is usually known, and the only missing field is who.
-- Storing it as a real credit means answering the question is an UPDATE, the
-- same re-tally runs, and nothing has to be re-charted.

alter table public.play_stat_credits
  add column if not exists resolution_status text not null default 'confirmed'
    check (resolution_status in ('confirmed', 'unresolved', 'coach_entered')),
  -- The question, in the coach's language, answerable from memory in one read.
  add column if not exists question text,
  -- The positions the model was choosing between, offered as one-tap answers.
  add column if not exists candidates jsonb,
  add column if not exists resolved_by uuid references auth.users(id),
  add column if not exists resolved_at timestamptz;

-- The queue: every open question for a team, newest film first. Partial, because
-- the whole point is that unresolved credits are the small minority.
create index if not exists play_stat_credits_open_questions_idx
  on public.play_stat_credits (team_id, created_at desc)
  where resolution_status = 'unresolved';
