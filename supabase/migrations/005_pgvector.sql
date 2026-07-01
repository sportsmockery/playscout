-- Enable pgvector extension
create extension if not exists vector;

-- Similarity search RPC for team memory
create or replace function match_team_memory(
  query_embedding vector(1536),
  match_team_id uuid,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  memory_type text,
  title text,
  content text,
  confidence numeric,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    id, memory_type, title, content, confidence, created_at,
    1 - (embedding <=> query_embedding) as similarity
  from public.team_memory
  where team_id = match_team_id
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
