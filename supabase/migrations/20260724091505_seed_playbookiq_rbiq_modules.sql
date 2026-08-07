insert into public.intelligence_modules (key, name, position_group, description) values
  ('RBIQ',       'Running Back Intelligence', 'RB',   'Evaluates running back vision and gap reads, ball security, one-cut footwork, and finishing through contact.'),
  ('PLAYBOOKIQ', 'Playbook Intelligence',     'TEAM', 'Analyzes an uploaded playbook (PDF/PPTX/DOCX/image) for strengths, weaknesses, age-appropriate complexity, per-module notes, and an install plan.')
on conflict (key) do nothing;
