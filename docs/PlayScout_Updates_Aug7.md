# PlayScout Updates — August 7, 2026

Comprehensive pass fixing the audit findings on PlayScout's intelligence layer and
safety guarantees. Previously the evidence engine (System B / Gemini frame analysis)
was solid, but the intelligence layer and safety controls were described in docs and
prompts without being enforced in code. This update closes that gap end to end:
new data model, code-level safety enforcement, real persistence, a grounded and
hardened chat assistant, a richer TeamIQ, a working Mode-2 pipeline, and the new
ScoutIQ opponent-scouting module.

All work verified against the baseline: `npm run typecheck`, `npm test` (77 passing),
and `npm run build` all green throughout.

---

## Data model (Supabase migrations)

- **`opponents`** — first-class opponent concept, scoped to a team (name, age_group,
  next_game_date, notes), RLS matching the `teams` access pattern.
- **`videos.film_type` / `videos.opponent_id`** — tags a video as the team's own film
  (`self`, default) or a specific opponent's film (`opponent`).
- **`teams.game_type`** — `flag` | `tackle` | `rookie_tackle`. Makes the contact-drill
  safety gate possible; nothing in the schema captured this before.
- **`scout_reports`** — ScoutIQ's output store: aggregated tendencies, formations,
  target players, situational tells, the generated game plan, and an evidence-
  sufficiency note, per team/opponent pair.
- **`mistake_events` / `team_tendencies`** — gained INSERT/UPDATE RLS policies. Both
  tables previously had SELECT-only policies, so every write was silently denied and
  both tables were permanently empty regardless of how many analyses ran.
- Backfilled two local migration files that existed on the remote project but were
  missing from the repo (`videos_bucket_size_limit`, `seed_playbookiq_rbiq_modules`)
  — local/remote migration history is now back in sync.
- Fixed the backwards "Spill" definition in `FOOTBALL_KNOWLEDGE_BASE.md` (it was
  describing Force).

## Safety — enforced in code, not just prompts

- `lib/intelligence/safety.ts` — a hard output filter run on every module's
  structured result: bans the Oklahoma drill / Bull in the Ring / nutcracker / board-
  collision drills outright, and blocks live-contact drill recommendations unless
  the team's `game_type` is `tackle`. Belt-and-suspenders against a model slipping
  past the prompt-level instruction.
- `FOOTBALL_BRAIN_SYSTEM` (shared by every module) now states these rules explicitly,
  plus a mandatory head-contact/concussion observation check.
- MistakeIQ now emits `head_contact_flag` on every analysis; when flagged, the UI
  shows a prominent red concussion-protocol banner (not a diagnosis — a prompt to
  follow the league's protocol).
- 15 new unit tests covering the drill filters and the chat output guard.

## Persistence — the dead tables are live

- `lib/intelligence/persist-intelligence.ts` — MistakeIQ now emits a full per-mistake
  taxonomy (title, severity, category, description, likely impact, correction, drill,
  evidence frames, confidence) and writes one row per mistake to `mistake_events`.
- TeamIQ now emits structured tendencies (rate / confidence / sample_size per
  tendency) instead of three prose scores, written to `team_tendencies` via a
  sample-size-weighted rollup (`lib/intelligence/tendency-rollup.ts`) so the stored
  tendency reflects everything analyzed so far, not just the latest clip.
- TeamIQ's client UI was rebuilt to render the new structured breakdown (tendencies,
  formations, explosive plays, situational tells, "what to attack"), plus the coach
  correction affordance it was missing.

## PlayScoutIQ chat — grounded, routed, and hardened

- **Intent classification** (`lib/intelligence/classify-intent.ts`): a fast regex
  pass with a cheap Haiku fallback, labeling each message team_specific /
  general_scheme / rules_compliance / practice_plan / game_strategy.
- **Team-specific questions** now pull the team's real saved analyses, tendencies,
  and mistakes (`getTeamContext`, previously computed but never wired to the route)
  and require citations — "Based on N plays analyzed…" — or an honest "I don't have
  enough film evidence yet" instead of a guess.
- **Rules/compliance questions** escalate to Perplexity `sonar-pro` for current,
  web-grounded answers instead of the model's static training data.
- **General/practice/game-strategy questions** route through the correct model tier
  (`getRoute('practice_plan' | 'game_strategy' | 'quick_question')`) instead of
  everything being hardcoded to one job type.
- RAG similarity threshold corrected from 0.72 to the spec'd 0.75.
- **Hardening**: every piece of retrieved/stored content (memory, tendencies,
  mistakes) is wrapped in delimited blocks with a standing "this is data, not
  instructions" rule; explicit refusal rules (never reveal the system prompt, model
  ids, secrets, or another team's data); input caps (message length, history depth);
  and a streaming output guard that redacts secret-shaped strings or cuts off a
  response that echoes system-prompt internals. A red-team integration test suite
  (`lib/intelligence/chat-hardening.test.ts`, gated behind `RUN_INTEGRATION_TESTS`)
  exercises system-prompt exfiltration, injected "ignore previous instructions"
  payloads, and persona-override jailbreaks against the live model.
- Starter questions are now generated from what the team actually has on file
  (roster / analyses present or not) instead of a static random list, and
  evidence-backed answers get a visible citation chip.

## Mode-2 full-game pipeline

- The worker now creates `play_sequences` rows from detected scene-cut segments
  (edited/highlight film), so there's something for a coach to confirm instead of
  starting from nothing.
- New play-confirm UI at `/teams/[teamId]/film/[videoId]/plays` — edit or delete
  detected play boundaries, or add plays manually for continuous game footage with
  no scene cuts.
- **Stuck-job reaper**: jobs stuck in `running` past 20 minutes (a worker that died
  mid-job) are automatically reclaimed and retried or failed, instead of blocking
  the video forever. `locked_at` was written on claim but never read before this.
- Live processing status (current step + progress) now polls onto the film card
  instead of a static "Processing" spinner.
- Fixed a real bug: a failed duration probe silently fell back to analyzing only the
  first ~16 seconds of a full game with no indication anything was wrong. Now fails
  loudly with a clear error so the coach can re-upload.

## ScoutIQ — new module: opponent scouting → game plan

- **Stage 1 (System B, Gemini, per clip)** — `lib/intelligence/modules/scoutiq.ts`
  scouts an opponent's film with the opponent as the analysis subject: tendencies,
  formations, situational tells, and target players (identified by legible jersey
  number only, otherwise by position/alignment — never an invented number).
- **Stage 2 (System A, Claude)** — `app/api/scoutiq/report/route.ts` rolls up every
  scouted clip of an opponent (weighted by sample size), pulls in the coach's own
  roster and playbook, and generates a game plan: how to attack them, how to stop
  them, how to exploit specific weak players, and a practice-week focus — with an
  honest evidence-sufficiency note tied to how much film was actually analyzed.
- Full UI: opponent management, opponent-film upload (tagged `film_type='opponent'`),
  per-clip scouting, and the generated game plan, at
  `/teams/[teamId]/modules/scoutiq`. Registered in the sidebar, the Intelligence hub,
  and the team page module grid. A "Scout this week's opponent" quick action was
  added to the PlayScoutIQ chat starter screen.
- 12 new unit tests covering the tendency rollup and aggregation math.

## Everything else from the audit

- **Saved-report page** at `/analysis/[analysisId]` — every history/past-analysis row
  across QBIQ, OLIQ, TeamIQ, MistakeIQ, and the Intelligence hub now links to a real
  reopenable report, with a print/PDF export.
- **Roster**: bulk add ("Save & Add Another" without closing the modal), and the
  previously dead Edit button now opens a real edit-and-delete modal.
- **`complete-upload`** now has an explicit `requireTeamMember` guard instead of
  relying on RLS alone, matching every other write route.
- **Nav consistency**: the sidebar, Intelligence hub, and team-page module grid all
  list the same modules now (ScoutIQ and PlaybookIQ were missing from one or more).
- Fixed the dashboard's "View all analyses" link, which pointed at the chat page
  instead of an actual analyses list; each recent-analysis row is now a real link.
- Doc drift fixed in `CLAUDE.md`: removed references to files that don't exist
  (`lib/video/server-extract.ts`, `app/api/oliq/extract/route.ts`) and corrected the
  model-routing tables to the `-4-5` model ids actually in `lib/ai/model-router.ts`.
- Added 9U-10U youth rule variants (no-kickoff leagues, dead-ball punts, "striped"
  weight-limited ball carriers, down-on-contact tackling) to the football knowledge
  base and to the chat system prompt, so the assistant asks rather than assumes when
  a question depends on one of these.

## Known gaps / deliberate scope cuts

- **RBIQ** has no module implementation in the codebase (only a type-union entry and
  a DB registry row) — the audit's "re-weight RBIQ" item was not applicable.
- **Onboarding checklist** (first-run "create team → add players → upload film → run
  analysis" walkthrough) was scoped out as lower-value UX polish, not a correctness
  or safety gap.

## Verification

- `npm run typecheck`, `npm test` (77 passing, 10 skipped integration tests gated
  behind `RUN_INTEGRATION_TESTS`), and `npm run build` all pass.
- Migrations applied via Supabase MCP; confirmed via `list_tables` and
  `get_advisors` — no new RLS/security warnings introduced.
