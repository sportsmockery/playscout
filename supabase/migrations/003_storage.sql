-- Storage buckets
insert into storage.buckets (id, name, public) values
  ('videos', 'videos', false),
  ('frames', 'frames', false),
  ('thumbnails', 'thumbnails', true);

-- Storage policies
create policy "Authenticated users can upload videos"
  on storage.objects for insert
  with check (bucket_id = 'videos' and auth.role() = 'authenticated');

create policy "Team members can read videos"
  on storage.objects for select
  using (bucket_id in ('videos','frames') and auth.role() = 'authenticated');

create policy "Public thumbnails"
  on storage.objects for select
  using (bucket_id = 'thumbnails');
