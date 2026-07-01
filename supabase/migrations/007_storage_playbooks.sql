INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'playbooks',
  'playbooks',
  false,
  52428800, -- 50MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]
);

CREATE POLICY "auth_playbooks_storage" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'playbooks')
  WITH CHECK (bucket_id = 'playbooks');
