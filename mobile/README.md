# PlayScout Mobile

The field-side and film-room companion to PlayScout — a native iOS/Android app
built with Expo. It takes a coach from **capture → status → evidence →
intelligence → correction → coaching** with the same evidence-first philosophy,
safety enforcement, and role permissions as the web app.

This is a real native app, not a WebView wrapper. It talks to the existing
PlayScout backend over authenticated HTTPS and streams PlayScoutIQ over SSE.

---

## Quick start

```bash
cd mobile
npm install
cp .env.example .env        # fill in the two Supabase public values
npx expo start              # then press i (iOS) / a (Android), or scan in Expo Go*
```

\* Native modules (secure store, video, notifications, TUS) need a development
build for full fidelity:

```bash
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

Built on **Expo SDK 54** (matches current Expo Go on iOS/Android).

### Environment

Only public values ever ship in the bundle (see `.env.example`). **Never** put a
service-role key or any AI provider key here.

| Var | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `EXPO_PUBLIC_API_URL` | PlayScout API base (default `https://playscout.ai`) |
| `EXPO_PUBLIC_SENTRY_DSN` | Optional crash reporting |

### Running against a local backend

The `/api/mobile/*` endpoints live in this branch, so for real data point the app
at a backend that has them. To use your dev machine's web server, run the repo
root with `npm run dev` and set `EXPO_PUBLIC_API_URL` to your machine's **LAN IP**
(not `localhost` — the phone can't reach that):

```bash
# mobile/.env
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:3000
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Find your LAN IP with `ipconfig getifaddr en0` (macOS). Phone and computer must be
on the same Wi-Fi. Also apply the `push_tokens` migration to Supabase.

---

## Architecture

```
app/                      Expo Router routes (file-based)
  (auth)/                 sign-in, verify (email OTP), forgot-password
  (app)/                  authenticated group (bootstrap + team gate + UploadRunner)
    (tabs)/               Home · Film · Analyze · Coach · More
    film/[videoId]        film detail (native player) + /plays confirmation
    analysis/[analysisId] report renderer + /correct editor + history
    module/[moduleKey]    analysis preflight → run
    upload/               staged TUS upload + progress queue
    roster · settings · notifications · team-picker
src/
  components/             native primitives (Screen, TopBar, TeamSwitcher, ScoreBlock,
                          SafetyAlert, ConfidenceLabel, EvidenceCount, FilmRow, …)
  features/               cohesive feature modules (uploads, reports, coach, film, intelligence)
  hooks/                  TanStack Query hooks (active-job-only polling)
  lib/                    supabase client, api client + SSE, auth, notifications, tus
  stores/                 zustand: active team + persistent upload queue
  theme/                  typed StyleSheet token system (light/dark)
  utils/                  pure logic: status, score bands, timecode, roles, levels
```

**State ownership**
- TanStack Query — server state (bootstrap/home/film/analyses/roster/opponents)
- Auth context — session/user (Supabase, restored before protected nav)
- Team store (zustand) — active team + role, persisted
- Upload store (zustand) — resumable upload queue, persisted
- Local state — view-specific interaction

---

## Authentication & security

- Passwordless **email OTP**, no open signup (`shouldCreateUser: false`) — matches
  the web's invite-only posture.
- The session persists in the OS keychain/keystore via a **chunked SecureStore
  adapter** (`src/lib/supabase/secureStorage.ts`) and auto-refreshes only while
  foregrounded.
- Every API call carries `Authorization: Bearer <access token>`. The server
  verifies it with `auth.getUser()` — the JWT payload is never trusted directly.
- Sign-out purges the query cache, upload metadata, and this device's push token.
- **Role permissions** mirror the server (`owner/admin/coach/analyst/viewer`).
  Viewers never see dead write controls; the server remains authoritative.

### Backend changes this app required (additive, in the repo root)

Kept narrow and non-breaking for the web app:

1. `lib/supabase/server.ts` — `createClient()` now attaches a `Bearer` token when
   the request carries one; **cookie behavior is unchanged when it doesn't.**
2. `lib/supabase/request.ts` — request-scoped client factory + bearer parser.
3. `requireTeamMember` / `requireTeamMemberForRow` / `requireAdmin` /
   `getCurrentMembership` accept an optional `opts.supabase` (the request-scoped
   client), defaulting to the cookie client. Same membership/RLS logic either way.
4. `app/api/mobile/*` — thin aggregation endpoints (bootstrap, home, film,
   film/[videoId], analyses, roster, opponents, push-tokens, account).
5. `supabase/migrations/*_push_tokens.sql` — per-user push-token table with RLS.

Reused existing routes unchanged: `videos/complete-upload`, `videos/[id]/status`,
`videos/[id]/retry`, `videos/[id]/frames`, `play-sequences*`,
`intelligence/analyze`, `intelligence/analysis/[id]`, `playscoutiq/chat`,
`scoutiq/report`.

Cookie/bearer parity is covered by `lib/auth/require-team-member.bearer.test.ts`
and `lib/supabase/request.test.ts`.

---

## Evidence-first & safety

- Reports use **progressive disclosure**: conclusion → confidence & evidence
  sufficiency → observation → interpretation → correction → practice → frames →
  detailed scores → coach correction. Observation and interpretation are never
  merged.
- **Confidence is distinct from the performance score**, always shown with a word
  and a percent; sample size sits alongside.
- **Safety outranks performance.** A head-contact observation renders above all
  analytics, states what was observed, points to concussion protocol, and never
  diagnoses. Acknowledgement does not remove the record.
- Only server-supported modules appear (QBIQ, RBIQ, OLIQ, TeamIQ, MistakeIQ,
  ScoutIQ, PlaybookIQ). WRIQ/DLIQ/LBIQ/DBIQ/PracticeIQ are intentionally absent.
- Provider/model names are never surfaced.

---

## Uploads (Mode 2)

Large video goes **directly to Supabase Storage over TUS** — never through
Next.js. Uploads are resumable across navigation, backgrounding, and app
restarts (`AsyncUrlStorage` persists the TUS URL; a deterministic object path
per upload id means retries never create duplicate video rows). The
`UploadRunner` drives the queue app-wide and registers completion through the
existing `videos/complete-upload` route exactly once.

Processing status is polled **only while a job is active**, then stops.

---

## Verify

```bash
# mobile
cd mobile
npm run lint
npm run typecheck
npm test
EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… npx expo-doctor
# expo-doctor reports 17/18: the one "duplicate react" note is expected — it
# sees the parent web repo's React at ../node_modules. Metro and EAS resolve
# the mobile app's own node_modules (verified via `expo export`).

# repository root (web/back-end regression)
cd ..
npm run typecheck
npm test
npm run build
```

---

## Shipping to TestFlight

The app cannot build until an EAS project exists and the two public Supabase
values are on it. `mobile/.env` is gitignored, so it never reaches EAS's
builders — the values must live on the EAS project or in `eas.json`.

```bash
cd mobile
npx eas login
npx eas init                      # creates/links the EAS project

# app.config.ts reads these from the environment. eas.json already carries
# EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_API_URL; the anon key is not
# committed, so set it once on the EAS project:
npx eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>" \
  --environment production --environment preview --visibility plaintext

# eas init prints the project id. Set it (and the Expo account/org that owns
# the app) so the TypeScript config can pick them up:
npx eas env:create --name EAS_PROJECT_ID --value "<uuid from eas init>" \
  --environment production --environment preview --visibility plaintext
npx eas env:create --name EAS_OWNER --value "<expo account or org>" \
  --environment production --environment preview --visibility plaintext

npx eas build --profile production --platform ios
npx eas submit --profile production --platform ios
```

`app.config.ts` **fails the build** when the required public vars are missing
rather than producing a binary that crashes on launch (`createClient('', '')`
throws at import). If one ever ships anyway, the app renders
`ConfigurationNotice` instead of dying at the splash screen.

`eas.json`'s submit profile reads `$ASC_APP_ID` and `$APPLE_TEAM_ID` from your
shell; omit them and EAS Submit prompts interactively.

### Before the first external TestFlight round

Internal TestFlight (your own team, up to 100 testers) needs no Apple review.
An **external** group does, and PlayScout has no open signup
(`shouldCreateUser: false`), so App Review must be given working demo
credentials in the review notes or the build is rejected as unusable.

Also required by Apple and already in place: a privacy policy URL
(`playscout.ai/privacy`), account deletion in-app (`DELETE /api/mobile/account`,
which only ever deletes the caller's own id), and
`usesNonExemptEncryption: false` so builds don't stall at export compliance.

The launcher icons in `assets/` are generated by `scripts/generate-assets.mjs`
(a flat gold chevron). They are the right dimensions and will pass review, but
they are placeholder art, not brand art.

---

## Status & scope

Implemented end-to-end with real data wiring: auth, team switching, Home
command center, Film library with folders and multi-select, film detail with
native playback, play confirmation, the Analyze hub, module preflight,
**batch analysis with a cumulative report**, the report renderer and
coach-correction, PlayScoutIQ SSE chat, **roster editing**, opponents
(including creating one), **film from a link**, the full TUS upload pipeline,
push-token registration, notifications preferences, and account deletion.

### Parity with the web app

Batch analysis, folders, opponents and film-from-link all reuse the **web API
routes unchanged**. `lib/supabase/server.ts` attaches the Bearer token this
client sends, and `requireTeamMember` runs the same membership check either
way, so a batch queued from a phone is the same row — drained by the same
Railway worker — as one queued from a browser.

Still web-only, and deliberately so for now:

| Area | Why |
|---|---|
| PlaybookIQ upload + play editing | Not a film module (absent from `analyze-position`'s `MODULE_MAP`); the app says so rather than offering a run that fails. Play editing hasn't met the native quality bar. |
| Team creation and team settings | Setup work, done once, off the field. |
| Admin: members, team access, usage | Org administration on a phone screen. |
| Hudl account connect + playlist import | Driving a coach's Hudl login from a phone is a credential surface worth deciding on deliberately. |
| Team intelligence dashboard (tendencies) | Home surfaces latest intelligence; the full dashboard is not ported. |

Each of these is reachable on the web, and the app does not pretend to offer
them.

### Known note: expo-doctor "duplicate react"

Because this Expo app lives **inside** the PlayScout web repo, `expo-doctor`
reports a duplicate `react` — the mobile app's `react` (in `mobile/node_modules`)
alongside the Next.js web app's `react` (in the repo-root `node_modules`). This
is benign: Metro resolves from `mobile/node_modules` only, and the native build
never includes the parent copy (verified by a clean `expo export`). Every other
doctor check passes.
