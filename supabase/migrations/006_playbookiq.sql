-- Playbook uploads
CREATE TABLE playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'pptx', 'docx', 'image')),
  storage_path TEXT,
  page_count INTEGER,
  extracted_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analysis results
CREATE TABLE playbook_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  overall_score INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  complexity_score INTEGER CHECK (complexity_score BETWEEN 0 AND 100),
  age_appropriate BOOLEAN,
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  qbiq_notes TEXT,
  oliq_notes TEXT,
  teamiq_notes TEXT,
  mistakeiq_notes TEXT,
  upgrade_recommendations JSONB DEFAULT '[]',
  plays_to_keep JSONB DEFAULT '[]',
  plays_to_remove JSONB DEFAULT '[]',
  install_order JSONB DEFAULT '[]',
  summary TEXT,
  model_provider TEXT,
  model_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members_playbooks" ON playbooks
  FOR ALL USING (
    team_id IN (
      SELECT t.id FROM teams t
      JOIN organization_members om ON om.organization_id = t.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "team_members_playbook_analyses" ON playbook_analyses
  FOR ALL USING (
    team_id IN (
      SELECT t.id FROM teams t
      JOIN organization_members om ON om.organization_id = t.organization_id
      WHERE om.user_id = auth.uid()
    )
  );
