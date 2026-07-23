# PlayScout IQ Analysis Knowledge Base
# The Deep Reference for How PlayScout Evaluates Film, Teams, and Plays

> This document is the analysis-layer companion to `FOOTBALL_KNOWLEDGE_BASE.md` (coaching
> standards, drills, safety) and `PLAYSCOUTIQ_SPEC.md` (system architecture). Where those
> files answer *"what is good youth football"* and *"how is the app wired,"* this file answers
> **"how does PlayScout actually score a quarterback, model a team's tendencies, and turn a
> play into evidence."** It is the source of truth for every IQ module's rubric, every team
> and play field the analysis engine reasons over, and the guardrails that keep output honest.
>
> Audience: engineers building or tuning modules, prompt authors, and the PlayScoutIQ
> assistant (System A) when it explains a score to a coach.

---

## Table of Contents

1. [The IQ Analysis Model](#1-the-iq-analysis-model)
2. [Universal Scoring Framework](#2-universal-scoring-framework)
3. [Module Catalog & Status](#3-module-catalog--status)
4. [Live Module Reference](#4-live-module-reference)
   - [QBIQ — Quarterback Intelligence](#41-qbiq--quarterback-intelligence)
   - [OLIQ — Offensive Line Intelligence](#42-oliq--offensive-line-intelligence)
   - [TEAMIQ — Team Intelligence](#43-teamiq--team-intelligence)
   - [MISTAKEIQ — Mistake Intelligence](#44-mistakeiq--mistake-intelligence)
   - [PLAYBOOKIQ — Playbook Intelligence](#45-playbookiq--playbook-intelligence)
5. [Planned Module Specifications](#5-planned-module-specifications)
6. [Team Intelligence Model](#6-team-intelligence-model)
7. [Play Intelligence Model](#7-play-intelligence-model)
8. [Cross-Module Synthesis](#8-cross-module-synthesis)
9. [Confidence, Sample Size & Anti-Hallucination](#9-confidence-sample-size--anti-hallucination)
10. [Analysis Glossary](#10-analysis-glossary)

---

## 1. The IQ Analysis Model

PlayScout's intelligence is not one AI "watching a game." It is a disciplined, two-layer
pipeline that separates **what was seen** from **what it means**.

### 1.1 The evidence chain

```
Video / clip
   │
   ▼  16 evenly spaced frames @ 768px wide (JPEG/base64)
Frame set  ──────────────────────────────────────────────┐
   │                                                      │
   ▼  routed by moduleKey                                 │
System B — VideoIQ Engine (Gemini 2.5 Pro)                │
   │  scores dimensions, cites evidence_frames,           │
   │  emits structured JSON with confidence               │
   ▼                                                      │
position_analysis_results / mistake_events /              │
team_tendencies  (Postgres, RLS-protected)               │
   │                                                      │
   ▼  async embedding (OpenAI text-embedding-3-small)     │
team_memory (pgvector) ◄──────────────────────────────────┘
   │
   ▼  RAG retrieval + recent results
System A — PlayScoutIQ Assistant (Claude Sonnet/Opus)
   │  interprets, plans, converses, always cites B
   ▼
Coach
```

**The rule that governs everything below:** a module scores only what the frames support.
Every number a coach sees is traceable to specific `evidence_frames`, carries a
`confidence`, and — for team-level reads — a `sample_size` / `plays_observed`. When the
evidence isn't there, the module returns `null` for that dimension and *says so* instead of
guessing. This is not a stylistic preference; it is enforced in each module's prompt and
validated by `PositionAnalysisOutputSchema` (Zod) before any result is written.

### 1.2 Three levels of analysis

PlayScout reasons at three nested scopes. Every module declares which scope it operates at,
because the scope changes how confidence and sample size behave.

| Scope | Unit of analysis | Modules | What "sample size" means |
|---|---|---|---|
| **Player** | One athlete across a clip | QBIQ, OLIQ, (RBIQ, WRIQ, DLIQ, LBIQ, DBIQ) | Number of snaps that athlete was involved in |
| **Play / event** | One snap-to-whistle sequence | MISTAKEIQ | Number of distinct mistakes surfaced |
| **Team** | A unit's behavior across snaps | TEAMIQ, SCOUTIQ | `plays_observed` — distinct snaps visible |
| **Document** | A playbook file | PLAYBOOKIQ | Pages / plays described in the file |

### 1.3 Observation vs. interpretation

Every module output physically separates the two, and the UI renders them differently:

- **Observation** lives in `reasoning[dimension]` and `evidence_frames`. It describes what is
  *visible* ("In frames 6–9 the quarterback's front foot lands closed, pointing toward the
  near sideline").
- **Interpretation** lives in `strengths`, `weaknesses`, `drills`, and `summary`. It
  translates observation into football meaning and a coaching action ("Closed front foot
  pulls throws to the left — rep the line-to-target step drill").

System A (PlayScoutIQ) may only ever *interpret*. It never adds new observations, because it
never sees frames.

---

## 2. Universal Scoring Framework

Every scoring module shares one framework so that a "72" in QBIQ means the same caliber of
performance as a "72" in OLIQ.

### 2.1 The 0–100 scale and its bands

| Band | Range | Meaning at the youth level | Coach translation |
|---|---|---|---|
| **Elite** | 90–100 | Executes the fundamental cleanly, repeatably, under stress; rare at 9U–10U | "Film this player as a teaching example" |
| **Advanced** | 80–89 | Sound technique with minor, non-costly flaws | "Ready for the next layer of complexity" |
| **Solid** | 70–79 | Assignment correct, technique mostly there, occasional breakdown | "On track — keep repping the base" |
| **Developing** | 60–69 | Right idea, technique inconsistent, costs the play sometimes | "This is the athlete's #1 practice priority" |
| **Beginner** | <60 | Assignment or fundamental not yet reliable | "Go back to the isolated fundamental before live reps" |

> **Age calibration is mandatory.** A 9U guard who anchors a bull rush earns an Advanced
> score for *9U*; the same clip does not earn an Advanced NFL grade. Every scoring prompt
> receives `age_group` and is instructed to grade against age-appropriate fundamentals only.
> When age is unknown, the module must state the assumption it made.

### 2.2 Weighted dimensions

Each scoring module defines **three dimensions** with fixed weights that always sum to 100%.
`overall_score = round(Σ weightᵢ × dimensionᵢ)`.

| Module | Dimension 1 (weight) | Dimension 2 (weight) | Dimension 3 (weight) |
|---|---|---|---|
| QBIQ | mechanics (40%) | decision_making (40%) | pocket_presence (20%) |
| OLIQ | pass_protection (40%) | run_blocking (40%) | footwork_leverage (20%) |
| TEAMIQ | offensive_tendency (⅓) | defensive_tendency (⅓) | execution_consistency (⅓) |
| MISTAKEIQ | assignment_integrity (⅓) | leverage_discipline (⅓) | ball_security (⅓) |

### 2.3 Null-dimension reweighting (critical)

A clip frequently lacks evidence for one dimension — a single handoff play has no pass to
grade for OLIQ's `pass_protection`; a defense-only clip has no `offensive_tendency` for
TEAMIQ. In that case the module returns **`null`** for that dimension (not `0`, not `50`) and
reweights the remaining dimensions proportionally.

```
Example — OLIQ on a pure run play (no pass attempt):
  pass_protection  = null            (no evidence)
  run_blocking     = 76              (weight 40% → renormalized to 40/(40+20) = 0.667)
  footwork_leverage= 68              (weight 20% → renormalized to 20/(40+20) = 0.333)
  overall_score    = round(0.667×76 + 0.333×68) = 73
```

The `reasoning` string for the null dimension must still be written, explaining *why* there
was no evidence ("No pass attempt occurred in this clip, so pass protection could not be
graded"). This behavior is codified in every module prompt and the schema permits
`nullable` dimension scores.

### 2.4 Confidence (0.0–1.0)

Confidence is a separate axis from score. A quarterback can earn a *high* mechanics score
with *low* confidence if only two frames caught the throw.

| Confidence | When to use | Effect on coach messaging |
|---|---|---|
| 0.85–1.0 | Clear, repeated evidence across many frames | "The film clearly shows…" |
| 0.6–0.84 | Evidence present but partial or single-angle | "The film indicates…" |
| 0.4–0.59 | Thin evidence, one play, or obstructed view | "It appears… (limited evidence)" |
| <0.4 | Barely visible; a guess would be irresponsible | "Not enough clear evidence — recommend re-filming" |

**Single-play cap:** when `plays_observed == 1`, team-level confidence must be ≤ ~0.4 and
every reasoning string must state the read is based on one play, not a season tendency.

### 2.5 Evidence frames

Every result carries `evidence_frames: number[]` — the 0-indexed frame positions (0–15) that
support the conclusion. This drives the UI's evidence cards, lets a coach verify the read
with their own eyes, and is the single strongest anti-hallucination control: a claim with no
supporting frame index is, by definition, not evidence-based and should not be made.

### 2.6 The standard result envelope

Every scoring module returns the same shape (`PositionAnalysisResult`), which is what makes
cross-module synthesis possible:

```typescript
interface PositionAnalysisResult {
  overall_score: number;                       // 0–100
  position_scores: Record<string, number|null>; // three weighted dimensions
  reasoning: Record<string, string>;            // one per dimension, observation-only
  strengths: string[];                          // interpretation
  weaknesses: string[];                         // interpretation
  drills: string[];                             // prescriptive, installable this week
  summary: string;                              // 2–3 sentence coach-facing headline
  confidence: number;                           // 0.0–1.0
  evidence_frames: number[];                    // 0–15 indices supporting conclusions
  plays_observed?: number;                      // team-scope modules only
  model: string;                                // provenance
  framesAnalyzed: number;                       // provenance
}
```

---

## 3. Module Catalog & Status

| Key | Name | Scope | Provider/Model | Status | Rubric owner |
|---|---|---|---|---|---|
| `QBIQ` | Quarterback Intelligence | Player | Google · gemini-2.5-pro | **Live** | §4.1 |
| `OLIQ` | Offensive Line Intelligence | Player | Google · gemini-2.5-pro | **Live** | §4.2 |
| `TEAMIQ` | Team Intelligence | Team | Google · gemini-2.5-pro | **Live** | §4.3 |
| `MISTAKEIQ` | Mistake Intelligence | Play | Google · gemini-2.5-pro | **Live** | §4.4 |
| `PLAYBOOKIQ` | Playbook Intelligence | Document | Anthropic · claude-opus | **Live** | §4.5 |
| `RBIQ` | Running Back Intelligence | Player | Google · gemini-2.5-pro | Planned | §5.1 |
| `WRIQ` | Receiver Intelligence | Player | Google · gemini-2.5-pro | Planned | §5.2 |
| `DLIQ` | Defensive Line Intelligence | Player | Google · gemini-2.5-pro | Planned | §5.3 |
| `LBIQ` | Linebacker Intelligence | Player | Google · gemini-2.5-pro | Planned | §5.4 |
| `DBIQ` | Defensive Back Intelligence | Player | Google · gemini-2.5-pro | Planned | §5.5 |
| `SCOUTIQ` | Opponent Scout Intelligence | Team | Anthropic · claude-opus | Planned | §5.6 |
| `PRACTICEIQ` | Practice Plan Intelligence | Team | Anthropic · claude-opus | Planned | §5.7 |

`IntelligenceModuleKey` is the enum of record in `lib/intelligence/schemas.ts`. New modules
must be added there, registered in `intelligence_modules` (DB), and given a rubric section
in this document before shipping.

---

## 4. Live Module Reference

Each live module below documents: the **dimension definitions**, the **frame-evidence
markers** the model should look for, **age-band benchmarks**, **common findings**, and the
**drill library** the module draws from. These are aligned to the actual prompt builders in
`lib/intelligence/modules/`.

### 4.1 QBIQ — Quarterback Intelligence

**File:** `lib/intelligence/modules/qbiq.ts` · **Weights:** mechanics 40 / decision 40 / pocket 20

QBIQ grades the quarterback's craft on a clip. It receives an optional `ATHLETE PROFILE`
(name, position, jersey, age group, coach notes), team context, and play context
(down/distance/yard line/coach label). With no profile it grades the visible QB against
age-appropriate youth fundamentals and states any assumption it made.

#### Dimension 1 — MECHANICS (40%)

*The physical throwing and ball-handling craft.*

| Sub-cue | What "good" looks like (youth) | Frame markers to read |
|---|---|---|
| Base width | Feet ~shoulder width, athletic, not narrow/wide | Pre-throw stance frames |
| Weight transfer | Back-to-front drive into the throw | Weight shift across 2–3 sequential frames |
| Stride length | Directional step *toward the target* | Front-foot landing frame |
| Hip–shoulder separation | Hips open before shoulders (torque) | Mid-throw torso rotation |
| Release point | Consistent, over-the-top-ish, above the ear | Ball-release frame |
| Follow-through | Hand finishes across body, thumb down | Post-release frame |
| Throwing posture | Tall base, not falling away | Whole-throw sequence |
| Ball security in action | Two hands until throw/handoff; high-and-tight on scramble | Carry frames |

#### Dimension 2 — DECISION_MAKING (40%)

*Reading the field and choosing well.*

| Sub-cue | What "good" looks like (youth) | Frame markers to read |
|---|---|---|
| Pre-snap recognition | Eyes/head scanning defense before snap | Pre-snap frames |
| Eye discipline | Looking off vs. staring down one target | Head/eye direction vs. ball destination |
| Progression evidence | Head moves through more than one option | Sequential head turns |
| Checkdown awareness | Takes the safe outlet when nothing's open | Late-progression frames |
| Pressure response | Steps up / throws away vs. panics into sack | Frames with defenders arriving |
| Avoiding forced throws | Not throwing into coverage/traffic | Throw-target frames vs. defender positions |

#### Dimension 3 — POCKET_PRESENCE (20%)

*Operating from snap to finish.*

| Sub-cue | What "good" looks like (youth) | Frame markers to read |
|---|---|---|
| Snap exchange | Clean catch/exchange, no bobble | Snap frames |
| Mesh point | Clean ride/clamp on handoff fakes | Backfield mesh frames |
| Carry out fake | Sells the fake with eyes and belly | Post-mesh frames |
| Drop/boot depth | Gets to launch depth without drifting flat | Dropback frames |
| Climb vs. bail | Steps *up* into a clean pocket vs. bailing backward | Pocket-movement frames |
| Escape with security | Two hands high-and-tight when scrambling | Scramble frames |

> **Null handling:** a pure run/handoff clip with no dropback has no `pocket_presence`
> passing evidence — the model returns `null` for it and reweights mechanics/decision.

#### QBIQ age benchmarks

| Cue | 8U target | 10U target | 12U target |
|---|---|---|---|
| Snap reception | ≥ 85% clean | ≥ 90% clean | ≥ 95% clean |
| Handoff mesh | Rides the back, occasional bobble | Clean ≥ 19/20 | Clean + sells fake |
| Base throw | Steps toward target, short range | Consistent to 10–12 yds | Timing throws with progression |
| Reads | Find #1, else run | Read one defender/picture | Full half-field progression |

#### QBIQ drill library

- QB–C exchange circuit (snap consistency)
- Net/target accuracy throws (release + follow-through)
- Three-step-to-hitch timing
- Boot/rollout throws on the move (pocket + mechanics on the move)
- Line-to-target step drill (fixes closed/open front foot)
- "Eyes-off" progression walk-through (decision-making, eye discipline)

### 4.2 OLIQ — Offensive Line Intelligence

**File:** `lib/intelligence/modules/oliq.ts` · **Weights:** pass_pro 40 / run 40 / footwork 20

OLIQ grades a single offensive lineman. When the subject lineman can't be uniquely
identified, the model states which lineman it graded and why. This module is the mature
"dynamic profile" pattern the other player modules follow.

#### Dimension 1 — PASS_PROTECTION (40%)

Set type and depth · first kick quickness · hand timing/placement (inside hands, thumbs up)
· anchor vs. bull rush · mirror/redirect vs. counters and games · pass-set posture · recovery
after contact.

#### Dimension 2 — RUN_BLOCKING (40%)

First-step explosion · pad level and leverage (low man wins) · hand placement and fit · hip
roll and leg drive · angle and aiming point on drive/reach/zone · combo block and climb to
the linebacker · finish.

#### Dimension 3 — FOOTWORK_LEVERAGE (20%)

Base width and balance · staying square vs. over-extending · knee bend and ankle flexion ·
avoiding crossing feet or lunging · recovery and re-fit after losing position.

> **Null handling:** run-only clip → `pass_protection = null`; pass-only clip →
> `run_blocking = null`. Remaining dimensions reweight proportionally.

#### OLIQ frame-evidence markers

| Phase | Frames to read | What to look for |
|---|---|---|
| Stance/pre-snap | 0–2 | Balanced stance, weight not on hands (tips run/pass) |
| First step | 2–4 | Direction, quickness, not false-stepping |
| Contact | 4–8 | Hand fit inside the frame, pad level under defender's |
| Sustain | 8–12 | Feet still driving, hips rolling, staying square |
| Finish | 12–15 | Defender controlled/displaced, block sustained to whistle |

#### OLIQ age benchmarks

| Cue | 8U target | 10U target | 12U target |
|---|---|---|---|
| Stance/first step | Balanced, correct direction | Explosive, low | Explosive + landmark accurate |
| Hand fit | Hands inside, some late | Inside, on time | Inside, timed, re-fits |
| Pad level | "Low man wins" understood | Wins leverage most reps | Wins leverage + finishes |
| Assignment busts | Occasional | < 10% | < 5% |

#### OLIQ drill library

- Stance-and-start mirror
- Fit-and-freeze on bags (hand placement, pad level)
- Sled/shield drive (leg drive, hip roll)
- Short-set pass-pro (kick slide, anchor)
- Pull/skip pathway (footwork, angle)
- Board/line footwork for crossing-feet correction (*no collision* — technique only)

### 4.3 TEAMIQ — Team Intelligence

**File:** `lib/intelligence/modules/teamiq.ts` · **Weights:** offense ⅓ / defense ⅓ / execution ⅓

TEAMIQ is the tendency engine. It analyzes a *unit's* behavior across the snaps visible in a
clip and is the most context-sensitive module because of **subject-team anchoring**.

#### Subject-team anchoring (the hardest problem this module solves)

Two teams are on the field. TEAMIQ must attribute every tendency to the **subject team** and
never silently drift to whichever team made the highlight play. Three inputs drive this:

1. **`jersey_color`** — "they wear navy" lets the model separate subject from opponent in
   every frame. Without it, and with no other identifier, the model must **not guess**; it
   states it can't tell the sides apart and describes only generically visible behavior.
2. **`side_of_ball`** (`offense` | `defense` | `both` | `unknown`) — **authoritative** when
   provided. If the coach says the subject is on offense, the model analyzes their offense,
   treats the other team as opponent context, and fills `defensive_tendency` by noting no
   defensive snaps by the subject were observed. If a frame seems to contradict the declared
   side, the model notes the ambiguity rather than flipping the subject.
3. **Exact team name** — always used verbatim; never shortened or abbreviated.

#### Dimensions

| Dimension | What it captures |
|---|---|
| `offensive_tendency` | Formation, motion, run direction, favorite play families, down-and-distance behavior |
| `defensive_tendency` | Front, coverage shell, blitz tendencies, edge setting, pursuit angles |
| `execution_consistency` | How cleanly the unit executes across the observed snaps |

> **Null handling:** a defense-only clip returns `offensive_tendency = null` (with a
> reasoning string saying no offensive snaps were observed) and reweights the other two;
> vice-versa for offense-only.

#### The tendency object

Every tendency TEAMIQ surfaces is a structured claim, not prose:

```typescript
interface Tendency {
  observation: string;   // "Runs right from tight double-wing"
  rate?: string;         // "71% of observed snaps"
  confidence: number;    // 0.0–1.0
  sample_size: number;   // plays this is based on
}
// Canonical phrasing:
// "Runs right on 71% of observed snap counts. Confidence: 0.78. Sample: 14 plays."
```

`plays_observed` on the result is the count of **distinct** snaps visible (one continuous
play from snap to whistle = 1). It is never inflated to make the sample look bigger. When it
is `1`, confidence is capped low and every reasoning string says the read is one play, not a
season tendency. See §6 for how these roll up into `team_tendencies` over time.

#### Tendency categories TEAMIQ looks for

See the full library in §6.4. In brief: perimeter-run bias, off-tackle bias, motion tells,
misdirection after establishing perimeter, formation/hash clustering (offense); overpursuit,
inside-out gap loss, soft edge, motion coverage busts, arm tackling (defense);
down-and-distance and field-position tells (both).

### 4.4 MISTAKEIQ — Mistake Intelligence

**File:** `lib/intelligence/modules/mistakeiq.ts` · **Weights:** assignment ⅓ / leverage ⅓ / ball_security ⅓

MISTAKEIQ detects **game-changing and recurring mistakes** from the frames. It also carries
the same jersey/anchoring discipline as TEAMIQ: only attribute a mistake to the team if the
team's players are identifiable.

#### Mistake taxonomy (13 categories)

| Category | Plain-language meaning |
|---|---|
| `missed_assignment` | Player did the wrong job / didn't do their job |
| `missed_block` | Blocker failed to engage or sustain |
| `missed_contain` | Edge/force player let the ball outside |
| `wrong_gap_fit` | Defender filled the wrong running lane |
| `bad_pursuit_angle` | Took a path that let the ballcarrier past |
| `poor_tackling_leverage` | Arm tackle / wrong shoulder / over-ran |
| `turnover_risk` | Loose carry, exposed ball, risky throw |
| `snap_mesh_issue` | Bad snap or botched handoff exchange |
| `alignment_error` | Lined up wrong (offsides, illegal formation, wrong spot) |
| `coverage_bust` | Defender lost or failed to pick up a receiver |
| `penalty_risk` | Technique/behavior likely to draw a flag |
| `poor_effort` | Loafing, not finishing, jogging to the ball |
| `clock_situation_error` | Time/clock mismanagement |

#### Mistake event object

Each surfaced mistake is a structured record (written to `mistake_events`):

```typescript
interface MistakeEvent {
  title: string;               // short name
  severity: 'minor'|'moderate'|'major'|'game_changing';
  category: string;            // one of the 13 above
  description: string;         // what happened, evidence-based
  likely_impact: string;       // what it cost or could cost
  correction: string;          // one coachable fix
  confidence: number;          // 0.0–1.0
  evidence_frames: number[];   // which frames show it
}
```

#### Severity ladder

| Severity | Definition | Example |
|---|---|---|
| `minor` | Technique flaw, didn't cost the play | Slightly high pad level but still won the block |
| `moderate` | Cost yards or field position | Missed backside cutoff, back cut for extra 6 yds |
| `major` | Cost a series, a score opportunity, or created real risk | Blown contain sprung a long TD run |
| `game_changing` | Directly caused/enabled points or a turnover | Fumbled exchange returned for a score |

#### Rollup dimensions

The clip's three scores summarize the mistake profile: `assignment_integrity` (were jobs
done right), `leverage_discipline` (angles, contain, tackling leverage), and `ball_security`
(carry/exchange/throw risk). **Null handling:** `ball_security` only applies if the team
possessed the ball at some point — a defense-only clip returns `null` for it.

### 4.5 PLAYBOOKIQ — Playbook Intelligence

**File:** `lib/intelligence/modules/playbookiq.ts` · **Model:** Claude Opus (deep document work)
· **Full build spec:** `PLAYBOOKIQ_BUILD.md`

PLAYBOOKIQ is the one **document-scope** module. A coach uploads a playbook (PDF / .pptx /
.docx / image scans); text is extracted (`lib/playbook/extract.ts`), diagrams optionally go
to Gemini as images, and Claude Opus produces a structured report.

#### What it evaluates

| Output field | Meaning |
|---|---|
| `overall_score` (0–100) | How complete, sound, and well-structured the playbook is |
| `complexity_score` (0–100) | **Inverted risk axis** — HIGH = too complex. >40 flags for 6U–10U; >65 for 11U–14U |
| `age_appropriate` (bool) | Is this safe/appropriate for the stated age group |
| `strengths[]` / `weaknesses[]` | Design quality points |
| `qbiq_notes` / `oliq_notes` / `teamiq_notes` / `mistakeiq_notes` | Each IQ module's read on what the playbook demands of that unit |
| `upgrade_recommendations[]` | `{title, reason, priority, module}` |
| `plays_to_keep[]` / `plays_to_remove[]` | Named from the actual playbook text only |
| `install_order[]` | `{week, play, reason}` — base plays first |

#### Complexity scoring guardrail

`complexity_score` is the inverse of the other scores: **higher is worse.** The module
penalizes over-complexity hard for young teams (youth should carry ≤ ~15 core plays). It
never invents plays not in the text; a missing section (e.g. no special teams) is reported as
a weakness, not fabricated.

---

## 5. Planned Module Specifications

These modules are named in `IntelligenceModuleKey` but not yet built. Each spec below defines
the three weighted dimensions, sub-cues, and drill direction so a future build slots straight
into the universal framework (§2) and result envelope (§2.6).

### 5.1 RBIQ — Running Back Intelligence (Player)

| Dimension (weight) | Sub-cues |
|---|---|
| `vision_decision` (40%) | Reads the block/landmark, hits the right gap, presses then cuts, patience vs. bouncing everything outside |
| `ball_security` (35%) | High-and-tight carry, correct arm (away from defender), two hands in traffic, protects through contact |
| `footwork_contact` (25%) | Path landmark accuracy, one-cut decisiveness, pad level through contact, finishing north–south |

*Null:* no carry in clip → score only what's visible (e.g. pass-pro or route). *Drills:* mesh
ladder, cone off-tackle entries, two-ball security, traffic gauntlet (no collisions at young
ages).

### 5.2 WRIQ — Receiver Intelligence (Player)

| Dimension (weight) | Sub-cues |
|---|---|
| `route_running` (40%) | Release off the line, stem to landmark, break sharpness, depth accuracy (±1 yd) |
| `hands_catch` (35%) | Eyes-to-tuck, catch above/below/in-front/behind, hands not body, secure the tuck |
| `blocking_effort` (25%) | Stalk-block fit-and-freeze, effort on run plays, sustaining the perimeter block |

*Drills:* tennis-ball eyes, line routes to cones, over-the-shoulder tracking, stalk-block
fit-and-freeze.

### 5.3 DLIQ — Defensive Line Intelligence (Player)

| Dimension (weight) | Sub-cues |
|---|---|
| `get_off_gap` (40%) | Get-off on the ball, gap landmark integrity, not jumping offsides |
| `block_defeat` (35%) | Strike/extension, peek-and-shed, keeping outside arm free where required |
| `pursuit_finish` (25%) | Pursuit angle inside-out, effort to the ball, tackle finish |

*Drills:* get-off stick, step-and-shock on shield, read-block mirror, cone pursuit.

### 5.4 LBIQ — Linebacker Intelligence (Player)

| Dimension (weight) | Sub-cues |
|---|---|
| `read_react` (40%) | Key read (backfield triangle), downhill trigger, not false-stepping |
| `gap_fit_leverage` (35%) | Correct gap fit, spill/force discipline, leverage on the ballcarrier |
| `tackle_finish` (25%) | Breakdown, near-foot, wrap, finish through contact |

*Drills:* shuffle-read-react, cone scrape, fit-and-freeze, angle tackle.

### 5.5 DBIQ — Defensive Back Intelligence (Player)

| Dimension (weight) | Sub-cues |
|---|---|
| `coverage_technique` (40%) | Pedal, break, cushion integrity, man-eyes vs. zone-eyes discipline |
| `ball_skills` (30%) | Locate the ball in the air, over-the-shoulder tracking, play the catch point |
| `run_support` (30%) | Force/overlap responsibility, alley fit, support-tackle completion |

*Drills:* W-drill, pedal-break-drive, zone-landmark cones, over-the-shoulder locate.

### 5.6 SCOUTIQ — Opponent Scout Intelligence (Team)

Aggregates TEAMIQ + MISTAKEIQ results across multiple opponent clips into a **scouting
report** for game-week prep. Not a fresh-frame module — it reasons over stored evidence
(System A territory, Claude Opus). Outputs: opponent's top offensive tendencies with
confidence and sample size, defensive vulnerabilities, "what to attack" call sheet,
situational tells (3rd-and-short, red zone), and an explicit **evidence-sufficiency** note
(how many plays the report is built on).

### 5.7 PRACTICEIQ — Practice Plan Intelligence (Team)

Turns the team's weakest observed dimensions and most frequent mistakes into a **week of
practice plans** using the microcycle and daily template in `FOOTBALL_KNOWLEDGE_BASE.md`.
Always filters through `age_group` and safety non-negotiables (no prohibited drills), defaults
to smaller menus + more reps, and cites the film evidence each priority is drawn from.

---

## 6. Team Intelligence Model

*"Way more info about the teams being analyzed."* This section defines every field the engine
knows about a team, the taxonomies it reasons over, and how single-clip reads become durable
team knowledge.

### 6.1 The team profile

The `teams` table (see `CLAUDE.md`) plus the analysis-time `team` context object:

| Field | Type | Why analysis cares |
|---|---|---|
| `name` | text | Used verbatim in every report; the anchor for attribution |
| `age_group` | text | Calibrates every score and every recommendation |
| `season` | text | Separates this season's tendencies from last |
| `league` / `state` | text | Rule-set context (kickoff/punt rules vary; see §7.5) |
| `offensive_style` | text | Prior that shapes tendency expectations (§6.2) |
| `defensive_style` | text | Prior that shapes tendency expectations (§6.3) |
| `jersey_color` | text | **Identity key** for subject-team anchoring in TEAMIQ/MISTAKEIQ |
| `side_of_ball` | enum | **Authoritative** which side to grade on a clip |
| `notes` | text | Coach-supplied context the model may weight |

> The two most important analysis fields are `jersey_color` and `side_of_ball`. Missing
> `jersey_color` forces the model into "I can't tell the teams apart" honesty on mixed
> clips; a correct `side_of_ball` prevents the single worst failure mode — grading the
> opponent's play as the subject team's.

### 6.2 Offensive style taxonomy

`offensive_style` is free text, but the analysis engine recognizes and calibrates to these
families (see `FOOTBALL_KNOWLEDGE_BASE.md` for the coaching detail):

| Style | Typical age fit | Expected tendency signature | Common structural weakness to probe |
|---|---|---|---|
| Tight / gap-based run (double-wing, power-T) | 8U–12U | Heavy inside/off-tackle, condensed splits, lead blocks | Predictable; vulnerable to fast edge + backside pursuit |
| Wing / motion misdirection | 8U–14U | Jet/wing motion, counter/reverse off perimeter action | Multiplies error if tags stack; mesh confusion |
| Gun spread-lite | 10U–14U (reliable snapper) | Wider splits, quick game, RPO-lite | Dies on bad snaps; protection holes |
| Under-center concept offense | 8U–14U | Play-action, backfield timing, fakes | Needs rep time; timing breaks under pressure |
| Single-wing / wildcat | 8U–12U | Direct snap, unbalanced looks, power/sweep | Limited pass threat; edge discipline beats it |
| Flag (varies) | 6U–14U | Pass-first, spacing, no line play | Rule-dependent — verify game type first |

### 6.3 Defensive style taxonomy

| Front | Age fit | Expected signature | Vulnerability to probe |
|---|---|---|---|
| 6-2 / 5-3 | 6U–10U run-heavy | Crowded box, simple edges | Weak DB support; perimeter + play-action |
| 4-4 | 10U–14U | Balanced, flexible force | Requires LB discipline; misdirection tests fits |
| 4-2-5 / nickel-lite | 12U–14U / advanced | Better space defense | Demands strong DB tackling; inside power |
| Goal-line | All tackle ages | Heavy, gap-sound near the goal | Over-used elsewhere; edge/pass over the top |

### 6.4 Tendency library (what the engine hunts for)

TEAMIQ and SCOUTIQ score frames against this catalog. Each is stored as a `team_tendencies`
row with `tendency_type`, `label`, `value` (JSON), `sample_size`, and `confidence`.

**Offense**
- `perimeter_run` — sweep/toss/jet bias (the most common youth weapon)
- `off_tackle_run` — strong-side inside-gap bias
- `motion_tell` — a motion that reliably precedes a specific play
- `misdirection` — counter/reverse frequency after establishing perimeter
- `formation_cluster` — aligning to one hash or one formation disproportionately
- `down_distance` — e.g. "runs on 89% of 1st downs," "throws on 3rd-and-long"
- `personnel_tell` — a substitution that signals run vs. pass

**Defense**
- `overpursuit` — flowing hard, leaving cutback/counter open
- `gap_loss_inside_out` — backside cutback available
- `soft_edge` — force defender not setting the edge
- `motion_coverage_bust` — failing to communicate motion adjustments
- `tackling_leverage` — arm tackling / over-running ballcarriers
- `blitz_tendency` — down/distance or formation that triggers pressure

**Both sides**
- `field_position` — scheme changes in own red zone / backed up
- `clock_situation` — two-minute / end-of-half behavior
- `hash_tendency` — play-direction preference by hash

### 6.5 From clip to durable tendency (the rollup math)

A single clip's `plays_observed` is small (often 1–5 snaps). Durable team knowledge comes
from **accumulating** clips into `team_tendencies`. The intended aggregation:

```
For a tendency across N clips:
  total_samples   = Σ plays_observed contributing to this tendency
  weighted_rate   = Σ (rateᵢ × plays_observedᵢ) / total_samples
  confidence      = f(total_samples, agreement across clips)
                    → rises with more samples AND consistent direction
                    → a lone clip caps confidence ≈ 0.4 (see §2.4)
```

**Sample-size honesty is non-negotiable.** A "71% runs right" from 14 plays is a usable
scouting fact; the same rate from 2 plays is noise and must be presented as such. Every
surfaced tendency reports its sample size so the coach can weight it.

### 6.6 Team memory (long horizon)

After every System B save, a natural-language summary is embedded
(`text-embedding-3-small`) and written to `team_memory` (pgvector). This is how PlayScoutIQ
"remembers" a team across a season. Retrieval is top-5 by cosine similarity above a 0.75
threshold, scoped to the team. Memory types mirror module keys (`QBIQ`, `TEAMIQ`, …). This
is what lets System A say *"Three weeks ago the film showed the same soft backside edge —
it's now a pattern, not a one-off."*

---

## 7. Play Intelligence Model

*"Way more info about the plays being analyzed."* A **play** (a `play_sequences` row) is the
atomic unit most analysis attaches to. This section defines its anatomy and the football
context the engine layers onto every clip.

### 7.1 Play sequence anatomy

| Field (`play_sequences`) | Meaning | How analysis uses it |
|---|---|---|
| `sequence_number` | Ordinal within the video | Ordering, "drive" reconstruction |
| `start_time_seconds` / `end_time_seconds` | Play boundaries in the film | Frame-window selection for extraction |
| `possession_team_id` | Who has the ball | Sets `side_of_ball` for subject team |
| `down` / `distance` | Down and yards to go | Down-and-distance tendency context |
| `yard_line` | Field position | Field-position tendency, red-zone flags |
| `result` | Play outcome | Outcome tagging, explosive-play detection |
| `coach_label` | Coach's own name for the play | Passed to modules as `PLAY:` context |
| `ai_summary` | Model's one-line read | Timeline display |
| `confidence` | Model's confidence in the read | Surfaced to coach |

### 7.2 The play-context object (analysis time)

Every scoring module can receive `playSequence: { down, distance, yard_line, coach_label }`.
QBIQ renders it as, e.g., `PLAY CONTEXT: 3rd & 7 +42 "Trips Right Sprint"`. This context
sharpens interpretation: a checkdown on 3rd-and-7 is a different decision than the same
throw on 1st-and-10.

### 7.3 Formation & personnel library

The engine recognizes and reasons over common youth formations. These are the labels TEAMIQ
uses when describing `formation_cluster` tendencies.

**Offensive formations**
- Double Wing / Tight Double Wing (condensed, power/counter identity)
- Power-I / Full-house (heavy run)
- Single Wing / Wildcat (direct snap)
- Trips / Spread-lite (gun, wider splits)
- Twins / Pro (balanced under-center)
- Empty (rare at youth; pass tell)

**Defensive fronts** — 6-2, 5-3, 4-4, 4-2-5, 46/bear-lite, goal-line (see §6.3).

**Personnel shorthand** (backs–tight ends): 21 (2 backs, 1 TE), 22, 12, 10, etc. At youth the
practical tells are number of backs, presence of a wing/TE, and receiver count.

### 7.4 Down-and-distance & situation framing

The engine buckets situations because tendencies live inside them:

| Bucket | Definition | Why it matters |
|---|---|---|
| 1st & 10 | Base down | Reveals the team's true "identity" call |
| 2nd & short (≤3) | Stay-on-schedule | Often the most predictable run |
| 2nd/3rd & long (≥7) | Passing down | Where pass tendency and pressure show |
| 3rd/4th & short (≤2) | Money down | Highest-leverage tendency to scout |
| Red zone (inside 20) | Compressed field | Scheme often changes; goal-line personnel |
| Backed up (own ≤10) | Field-position risk | Conservative tells |
| Two-minute | Clock pressure | Situational-error detection (MISTAKEIQ) |

### 7.5 Special-teams rule dependency (hard gate)

Before any special-teams read or recommendation, the engine must confirm the **rule set**
(`league`/`state` context), because youth rules vary wildly:

- Are kickoffs live? Are punts live?
- Is there a no-rush / no-line-up-over-snapper provision?
- Mandatory distance or dead-ball mechanic?

A flag game and a tackle game produce *different* correct answers. The engine verifies
`game_type` before any contact or special-teams scheme output. (Detail in
`FOOTBALL_KNOWLEDGE_BASE.md`.)

### 7.6 Play result & explosive-play taxonomy

`result` is normalized so outcome-based analysis (MISTAKEIQ, explosive-play detection) can run:

| Result class | Examples | Flags it raises |
|---|---|---|
| Positive gain | run/pass gain, first down, TD | Explosive if ≥ 10 yds (or age-adjusted threshold) |
| Neutral | short gain, no gain | — |
| Negative | TFL, sack, penalty | Mistake candidate |
| Turnover | fumble, interception, turnover on downs | `turnover_risk` / `game_changing` review |
| Special teams | punt, PAT, kickoff, return | Rule-gated (§7.5) |

**Explosive play** = a gain of 10+ yards (a common youth threshold; adjust per league). When
one occurs, TEAMIQ is asked *what alignment or leverage mistake created it* — explosive plays
are almost always a **force, gap, or pursuit failure**, and naming which one is the coaching
gold.

### 7.7 Frame-to-evidence mapping

The 16 frames are the play's timeline. Modules map football phases onto frame windows:

```
Frame index:  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
Phase:        │pre-snap│  snap  │  develop / mesh │   attack / throw   │ finish │
Read for:     alignment  get-off  exchange/set     block/route/decision  result
```

A conclusion cites the frames in its phase window. "Blown contain" should cite attack/finish
frames where the edge is visible; "false start" should cite pre-snap frames. A claim whose
`evidence_frames` don't match its phase is a red flag for a hallucinated read.

### 7.8 Play boundary detection (Mode 2)

For full-game processing, the worker pipeline detects play boundaries before per-play
extraction (Queued → Preparing Film → Extracting Frames → Building Timeline → **Finding
Plays** → …). Coaches confirm/correct boundaries in the UI, because boundary accuracy
directly determines whether `plays_observed` and every downstream tendency is trustworthy. A
mis-cut boundary that merges two snaps corrupts sample counts — so human confirmation is part
of the evidence chain, not an afterthought.

---

## 8. Cross-Module Synthesis

Individual module results become team intelligence through synthesis. This is System A's job
(PlayScoutIQ), and it only ever combines evidence B already produced.

### 8.1 How the modules feed each other

```
QBIQ ─┐
OLIQ ─┼─► position_analysis_results ─┐
RBIQ… ┘                              │
MISTAKEIQ ─► mistake_events ─────────┼─► PlayScoutIQ (System A)
TEAMIQ ─► team_tendencies ───────────┤        │
         team_memory (pgvector) ─────┘        ▼
                                     SCOUTIQ / PRACTICEIQ / chat answers
```

- **PLAYBOOKIQ** cross-references the *other* modules at document time: its `qbiq_notes`,
  `oliq_notes`, `teamiq_notes`, and `mistakeiq_notes` are those modules' *perspective on a
  playbook*, not fresh film reads.
- **SCOUTIQ** aggregates TEAMIQ + MISTAKEIQ over many opponent clips.
- **PRACTICEIQ** consumes the team's weakest dimensions + most frequent mistakes.

### 8.2 The synthesis contract

When System A combines results it must:
1. Cite counts — *"Based on 3 QBIQ analyses across 2 games…"*
2. Preserve confidence — never present a 0.4-confidence single-play read as settled fact.
3. Preserve sample size — a tendency's `sample_size` travels with it.
4. Say when evidence is thin — *"I don't have enough film to call this a pattern yet."*
5. Never invent a number that isn't in a stored result.

---

## 9. Confidence, Sample Size & Anti-Hallucination

Every rule in the product's philosophy reduces to: **never claim more than the film supports.**
The controls, consolidated:

| Control | Where enforced | What it prevents |
|---|---|---|
| Confidence score (0.0–1.0) | Every module output | Overstating a thin read |
| `evidence_frames` | Every module output | Claims with no visual support |
| `plays_observed` / sample size | TEAMIQ, tendencies | Treating 2 plays like a season |
| Single-play confidence cap (≤0.4) | TEAMIQ prompt | "Tendency" from one snap |
| Null dimension + reasoning | All scoring modules | Fake scores where there's no evidence |
| Subject-team anchoring | TEAMIQ, MISTAKEIQ | Grading the opponent as the subject team |
| Jersey-color gate | TEAMIQ, MISTAKEIQ | Guessing which players are the team |
| `side_of_ball` authority | TEAMIQ | Flipping offense/defense mid-clip |
| Zod output validation | `analyze-position.ts` | Malformed results reaching a coach |
| No invented facts | Every prompt (`FOOTBALL_BRAIN_SYSTEM`) | Fabricated numbers, names, scores |
| Age-band calibration | Every scoring prompt | NFL/college standards on 9U kids |

**The seven hard "never"s (from `FOOTBALL_BRAIN_SYSTEM`, restated for analysis authors):**
never invent jersey numbers, names, scores, or stats; separate observation from
interpretation; use confidence scores; cite the frames; say when the subject is unclear;
grade against age-appropriate fundamentals; never claim certainty when evidence is limited.

---

## 10. Analysis Glossary

*Complements the coaching glossary in `FOOTBALL_KNOWLEDGE_BASE.md`; these terms are specific
to how PlayScout analyzes.*

| Term | Definition |
|---|---|
| Dimension | One of a module's three weighted scoring axes (e.g. QBIQ `mechanics`) |
| Null dimension | A dimension with no applicable evidence in the clip; scored `null`, reasoning still written |
| Reweighting | Redistributing weights across the non-null dimensions to compute `overall_score` |
| Evidence frame | A 0–15 frame index cited as visual support for a conclusion |
| Confidence | 0.0–1.0 certainty in a read, independent of the score itself |
| Sample size / `plays_observed` | Count of distinct snaps a team-level read is based on |
| Subject-team anchoring | Attributing every tendency/mistake to the correct team, never the opponent |
| Jersey-color gate | Requiring a color identifier before attributing behavior to a team |
| `side_of_ball` | Authoritative declaration of which side the subject team plays on a clip |
| Tendency | A statistically repeated, sample-sized, confidence-scored behavior |
| Explosive play | A gain of 10+ yards (age-adjustable); triggers cause-analysis |
| Result envelope | The shared `PositionAnalysisResult` shape every scoring module returns |
| Team memory | pgvector-embedded summaries that give System A season-long recall |
| System B / VideoIQ | The evidence layer — sees frames, scores, never converses |
| System A / PlayScoutIQ | The intelligence layer — reasons over evidence, never sees frames |
| Module scope | Whether a module analyzes a player, a play, a team, or a document |
| Complexity score | PLAYBOOKIQ's inverted axis — higher means too complex for the age group |
| Severity | MISTAKEIQ's impact ladder: minor → moderate → major → game_changing |

---

*This knowledge base is versioned with the codebase. When a module's rubric, weight, or
dimension names change in `lib/intelligence/modules/`, update the matching section here in the
same change. When a planned module (§5) ships, move it to the Live Module Reference (§4) with
its real file path.*
