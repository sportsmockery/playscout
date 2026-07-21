# Migration history — true apply order

**Rule: never renumber or edit an already-applied migration.** Filenames in
this directory are NOT reliably sorted in the order they were actually
applied to the live database — several were applied out of filename order,
and a few were applied directly via tooling and only reconstructed as local
files afterward. This file is the source of truth for what actually
happened; sort by filename at your own risk.

All future migrations use a `YYYYMMDDHHMMSS_name.sql` timestamp prefix
(starting after `028_increment_rate_limit_fn.sql`), which sorts correctly by
construction. Everything below predates that convention.

## True order (from `supabase_migrations.schema_migrations`, oldest first)

| Applied (UTC)         | DB version       | Local file                                    | Notes |
|------------------------|------------------|------------------------------------------------|-------|
| 2026-07-01 10:43:18 | `20260701104318` | `000_enable_pgvector_extension.sql`             | Reconstructed — see below |
| 2026-07-01 10:43:58 | `20260701104358` | `001_initial_schema.sql`                        | |
| 2026-07-01 10:44:21 | `20260701104421` | `002_rls.sql`                                   | |
| 2026-07-01 10:44:38 | `20260701104438` | `003_storage.sql`                               | |
| 2026-07-01 10:45:08 | `20260701104508` | `005_pgvector.sql`                              | DB name `005_pgvector_rpc`; no `004_*` was ever applied |
| 2026-07-01 10:45:49 | `20260701104549` | `006_playbookiq.sql`                            | |
| 2026-07-01 10:46:11 | `20260701104611` | `007_storage_playbooks.sql`                     | |
| 2026-07-01 10:46:46 | `20260701104646` | `008_intelligence_modules_rls.sql`              | |
| 2026-07-07 04:15:53 | `20260707041553` | `009_organization_bootstrap.sql`                | |
| 2026-07-07 04:16:21 | `20260707041621` | `010_teams_level_column.sql`                    | |
| 2026-07-07 06:04:56 | `20260707060456` | `011_fix_org_members_recursion.sql`             | |
| 2026-07-07 06:10:29 | `20260707061029` | `012_fix_organizations_select_recursion.sql`    | |
| 2026-07-07 06:38:00 | `20260707063800` | `013_analysis_write_policies.sql`               | |
| 2026-07-07 07:25:44 | `20260707072544` | `014_teams_jersey_color.sql`                    | |
| 2026-07-07 07:45:46 | `20260707074546` | `015_teams_home_away_jersey_colors.sql`         | |
| 2026-07-17 22:49:56 | `20260717224956` | `016_team_access.sql`                           | The first `016_*` applied |
| 2026-07-17 22:51:47 | `20260717225147` | `017_lock_team_access_helpers.sql`              | The first `017_*` applied |
| 2026-07-17 22:52:06 | `20260717225206` | `017b_revoke_team_helpers_from_anon.sql`        | Reconstructed — see below |
| 2026-07-18 04:21:15 | `20260718042115` | `018_org_wide_team_access.sql`                  | |
| 2026-07-18 04:49:15 | `20260718044915` | `016_storage_team_scoping.sql`                  | **Applied AFTER 018**, despite the filename |
| 2026-07-18 05:10:49 | `20260718051049` | `017_org_members_and_team_management.sql`       | **Applied AFTER 018**, despite the filename |
| 2026-07-18 08:27:15 | `20260718082715` | `019_playbook_plays.sql`                        | |
| 2026-07-19 07:25:50 | `20260719072550` | `020_analysis_corrections.sql`                  | |
| 2026-07-19 07:45:54 | `20260719074554` | `021_playbooks_role_scoped_rls.sql`             | |
| 2026-07-19 07:55:00 | `20260719075500` | `022_playbook_analysis_play_links.sql`          | |
| 2026-07-19 07:58:44 | `20260719075844` | `023_playbook_plays_page_type.sql`              | |
| 2026-07-21 04:16:37 | `20260721041637` | `024_output_corrections.sql`                    | |
| 2026-07-21 04:20:29 | `20260721042029` | `025_playbooks_analysis_mode.sql`               | |
| 2026-07-21 04:38:17 | `20260721043817` | `026_ai_usage_ledger.sql`                       | |
| 2026-07-21 04:44:28 | `20260721044428` | `027_rate_limits.sql`                           | |
| 2026-07-21 04:44:45 | `20260721044445` | `028_increment_rate_limit_fn.sql`               | |

## Why two files are marked "Reconstructed"

`000_enable_pgvector_extension.sql` and `017b_revoke_team_helpers_from_anon.sql`
were applied straight to the live database via tooling in earlier sessions
and were never saved as local files at the time — the migration history in
this directory was incomplete until this README's companion commit added
them back, pulled verbatim from `supabase_migrations.schema_migrations`, so
`git log` on this directory now actually reflects everything that's live.

## The `016_*` / `017_*` filename collisions

Two unrelated migrations were each named `016_*` and two were each named
`017_*` before anyone noticed. Per the no-renumber rule they were left
exactly as applied rather than retroactively renamed, which would have
been indistinguishable from editing an applied migration. **Do not assume
filename order reflects apply order for any of these four files** — the
table above is authoritative. A fresh database bootstrapped by running
every file in filename order would very likely still end up schema-correct
(the reordered pairs don't appear to depend on `018`), but this has not
been verified by actually doing it, so don't take that on faith either.
