-- 023_playbook_plays_page_type.sql
--
-- The playbook rasterization pipeline was giving static alignment/formation
-- reference diagrams a full per-player assignment table, same as a real live
-- play call — those diagrams don't actually have assignments to extract.
-- Adds page_type so a prior classification step (worker's processPage, see
-- lib/intelligence/modules/playbook-play.ts) can mark a page as
-- 'formation_reference' and skip the assignment-extraction call entirely.

alter table public.playbook_plays
  add column if not exists page_type text not null default 'live_play'
    check (page_type in ('live_play', 'formation_reference'));
