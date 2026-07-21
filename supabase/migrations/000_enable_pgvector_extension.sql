-- 000_enable_pgvector_extension.sql
--
-- Reconstructed from supabase_migrations.schema_migrations (version
-- 20260701104318) — this was applied directly via the DB tooling in an
-- earlier session and never saved as a local file. Content verified to
-- exactly match what's live. See supabase/migrations/README.md for the
-- full true-apply-order history and why this file exists.

create extension if not exists vector;
