-- 20260903000000_native_video_analysis.sql
--
-- Analysis reads the clip itself rather than 16 stills sampled out of it.
--
-- The rubrics grade motion — kick slide, weight transfer, hand timing, leg
-- drive — none of which is legible in frames sampled ~2.7fps apart. Two
-- columns support sending the real video, and two record what we sent.

-- Gemini's Files API handle for a video too large to inline. A merged game
-- film is uploaded once and then referenced by every play cut out of it (via
-- start/end offsets), so a 100-clip breakdown costs one upload rather than a
-- hundred. Handles expire — Gemini deletes the file — so the expiry is stored
-- alongside and a stale handle is re-uploaded rather than reused.
alter table public.videos
  add column if not exists gemini_file_uri text,
  add column if not exists gemini_file_expires_at timestamptz;

-- Which path produced a result. Native video and frame extraction are kept
-- side by side deliberately: film with no storage_path (external_url links)
-- still has to fall back to frames, and comparing the two on identical clips
-- is how the eval harness shows the change was worth its cost.
alter table public.position_analysis_results
  add column if not exists analysis_mode text
    check (analysis_mode is null or analysis_mode in ('video', 'frames'));

-- Confidence has been written inside the `evidence` jsonb since the first
-- result was saved, which means it cannot be queried — so nobody can ask
-- whether 0.8-confidence claims are right about 80% of the time. Promote it
-- to a column so calibration is measurable.
alter table public.position_analysis_results
  add column if not exists confidence numeric;

create index if not exists position_analysis_results_mode_idx
  on public.position_analysis_results (module_key, analysis_mode);
