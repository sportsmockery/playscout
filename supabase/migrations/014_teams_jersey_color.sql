-- 014_teams_jersey_color.sql
-- Modules like TeamIQ/MistakeIQ have no way to tell which players in a clip
-- belong to the team being analyzed vs. the opponent — there's no jersey
-- color or other visual identifier anywhere in the context sent to Gemini.
-- Without it, the model silently guesses which side is "us" (e.g. calling
-- offense/defense wrong) instead of following the anti-hallucination rule
-- to say the subject is unclear. Coaches can now record jersey/helmet
-- colors on the team profile so the AI has an actual basis to identify them.

alter table public.teams add column jersey_color text;
