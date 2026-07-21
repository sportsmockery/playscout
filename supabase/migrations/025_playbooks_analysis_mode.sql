-- 025_playbooks_analysis_mode.sql
--
-- Only PDF playbooks get visual per-play analysis (rasterization +
-- assignment extraction). PPTX/DOCX/image uploads silently fell back to
-- text-only analysis with no indication to the coach that the play-diagram
-- feature wasn't running for their file. Stores which mode a playbook
-- actually got, set once at upload time by the format check that's already
-- there (app/api/playbookiq/upload/route.ts's pages_status branch).

alter table public.playbooks
  add column if not exists analysis_mode text not null default 'visual'
    check (analysis_mode in ('visual', 'text_only'));
