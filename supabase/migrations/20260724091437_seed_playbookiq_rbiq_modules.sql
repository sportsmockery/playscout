-- Seed two intelligence modules into the registry that were shipped in code
-- but never added to public.intelligence_modules:
--   - PLAYBOOKIQ: built (page + /api/playbookiq routes) but missing from the
--     registry, which only carried the original four (QBIQ/OLIQ/TEAMIQ/MISTAKEIQ).
--   - RBIQ: newly shipped as a live frame-analysis module.
--
-- position_analysis_results.module_key is free text (no FK to this table), so
-- these modules already function end-to-end; this row is registry/metadata
-- consistency so the registry reflects what the app actually offers.
--
-- Idempotent: key is unique, so re-applying is a no-op.

insert into public.intelligence_modules (key, name, position_group, description) values
  ('RBIQ',       'Running Back Intelligence', 'RB',   'Evaluates running back vision and gap reads, ball security, one-cut footwork, and finishing through contact.'),
  ('PLAYBOOKIQ', 'Playbook Intelligence',     'TEAM', 'Analyzes an uploaded playbook (PDF/PPTX/DOCX/image) for strengths, weaknesses, age-appropriate complexity, per-module notes, and an install plan.')
on conflict (key) do nothing;
