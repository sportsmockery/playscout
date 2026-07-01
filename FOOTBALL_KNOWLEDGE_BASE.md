# PlayScout Football Knowledge Base
# Youth Football Coaching Intelligence — Standards-Driven Reference

## Authority Hierarchy

Sources ranked by trust level for PlayScout AI responses:

| Priority | Source | Use for |
|---|---|---|
| 1 — Highest | USA Football, NFL Football Operations, NFHS | Rules, age/game-type progression, practice/contact standards |
| 1 — Highest | CDC, NATA, AAP, NOCSAE | Concussion, heat, emergency plans, equipment safety |
| 2 — High | BJSM, Pediatrics, JSCR, Journal of Athletic Training | LTAD, training load, warm-ups, coach behavior, youth conditioning |
| 3 — Medium | Hudl official docs | Tagging logic, reporting fields, scouting workflows |
| 4 — Low | Local/league examples | Only when national standards don't specify |

**When Perplexity is routed a football knowledge question, cite sources at this priority level.**

---

## Age Band Framework

> IMPORTANT: Local leagues set their own age-cut dates. Always store a league-specific override alongside common age mappings.

| U-level | Common ages | Game type | Practice duration | Contact emphasis | Success looks like |
|---|---|---|---|---|---|
| 6U | 5–6 | Flag first | 30–60 min, 1–2x/week | No live collisions; two-point stance only | Fun, attendance, basic ball security, lines up on cadence |
| 8U | 7–8 | Flag or Rookie Limited Contact | 60–90 min, 1–3x/week | Two-point stance preferred; progressive contact intro | Small core menu, maintain leverage, finish controlled reps |
| 10U | 9–10 | Rookie Tackle or early Senior Tackle | 75–105 min, 2–3x/week | Progressive contact; block-defeat and simple special teams | Clean alignment, fewer busts, protected ball, basic reads |
| 12U | 11–12 | Senior Tackle | 90–120 min, 2–3x/week | Full contact under limits; technique before scheme | Consistent assignment + technique, self-correct with film |
| 14U | 13–14 | Senior Tackle / higher flag | 90–120 min, 2–3x/week | Full contact under youth limits; align with NFHS where applicable | Executes full weekly plan, understands game situations |

**Never recommend NFL/college-caliber complexity at 6U–10U. Grade against age-appropriate fundamentals only.**

---

## Core Design Principles

1. **Player-first development** — football builds better people, better athletes, better players. Optimize for safe progression, confidence, enjoyment, and retention — not just tactical answers.
2. **Progressive complexity** — before installing a blitz package, confirm the team has mastered stance, alignment, snap exchange, leverage, pursuit, and communication.
3. **Repetition over volume** — smaller play menus, repeated concept families, common terminology, high-rep stations with clear cues.
4. **Safety embedded in logic** — USA Football contact levels, drill prohibitions, practice limits, and heat rules are hard constraints, not suggestions.

---

## Knowledge Object Structure

Every PlayScout coaching recommendation should be a structured object with these fields:

```typescript
interface CoachingKnowledgeObject {
  topic: string;                  // "RB mesh fundamentals"
  age_band: string;               // "8U recommended, 10U+ advanced"
  game_type: string;              // "Flag / Rookie Tackle / Senior Tackle"
  rule_dependencies: string;      // "Local kickoff rules override default special teams menu"
  rationale: string;              // Why this exists
  prerequisites: string[];        // "Under-center snap ≥ 85% successful"
  implementation_steps: string[]; // Step-by-step field instructions
  teaching_cues: string[];        // "Soft hands, pocket, ride, clamp"
  sample_drills: string[];        // Executable drill names
  measurable_outcomes: string[];  // "< 1 exchange drop per 20 reps"
  common_errors: string[];        // Diagnostic coaching points
  troubleshooting: string[];      // Adaptive coaching responses
  safety_flags: string[];         // "No live collisions required"
}
```

---

## Offensive Fundamentals

### Position Groups

**Quarterback**
- Prerequisites: stance → hand placement → under-center snap/gun catch → ball carriage → handoff mesh → base throw → three-step/rollout
- Drills: QB-C exchange circuit, net/target throws, three-step to hitch, boot rollout throws
- Metrics: Snap reception ≥ 90%, handoff mesh clean ≥ 19/20 reps
- Errors: dropped snaps (slow cadence, isolate exchange), accuracy sailing (shorten stride, fix base before adding routes)
- Youth cue: "Eyes through the mesh, soft hands, ride the back"

**Running Back**
- Prerequisites: stance → alignment landmarks → mesh pocket → ride/clamp → first-step angle → ball carriage → cut off landmark
- Drills: Mesh ladder, cone off-tackle entries, two-ball security, traffic gauntlet (no collisions at younger ages)
- Metrics: Zero balls on ground per team period, path landmark hit rate ≥ 85%
- Errors: leaving mesh early (verbal cue + pause), drifting (paint landmark cones)
- Youth cue: "Pocket open, ride it, clamp it, cover it"

**Receiver / TE**
- Prerequisites: stance → release step → stem to landmark → eyes/hands triangle → catch above/below/in front/behind → tuck and transition
- Drills: Tennis-ball eyes, line routes to cones, partner over-shoulder tracking, stalk-block fit-and-freeze
- Metrics: Route depth ±1 yard, catch rate by route type
- Errors: rounding stems (reduce menu), body catching (softer balls, front-side hand cues)
- Youth cue: "Thumbs together above the waist, pinkies together below"

**Offensive Line**
- Prerequisites: stance → first step → hat/hand placement → fit → feet on contact → run block → pass set → pull
- Drills: Stance/start mirror, fit-and-freeze on bags, sled/shield drive, short-set pass pro, pull/skip pathway
- Metrics: False starts down, fit accuracy ≥ 85%, assignment busts < 10%
- Errors: head drops (go back to bags and posture), crossing feet (short boards/lines for footwork)
- Youth cue: "Low man wins, hands inside, drive the feet"

**Center**
- Prerequisites: grip → stance → under-center snap → shotgun snap → reset to block
- Drills: Snap progression ladder, target bucket, snap-and-step
- Metrics: Accurate snaps ≥ 90%
- Errors: floating snaps (lower elbow, shorten motion)

### Offensive Concept Families

| Family | Best fit | Strengths | Risks | Recommendation |
|---|---|---|---|---|
| Tight/gap-based run | 8U–12U | Better angles, easier blocking landmarks | Predictable | Core family for teams new to tackle |
| Wing/motion misdirection | 8U–14U | Teaches leverage, counters, eye discipline | Multiplies if tags stack | Hard cap on motions and tags |
| Gun spread-lite | 10U–14U with reliable snapper | Simplifies QB eyes, helps spacing | Bad snaps kill it | Only after snap and protection metrics are stable |
| Under-center concept offense | 8U–14U | Teaches exchange, fakes, backfield timing | Requires more rep time early | Good for all-around development |

### Core Play Family Structure

Every offensive identity should have: core play → constraint play → counter → safe pass complement — all from the same picture.

**Toss / Speed Sweep**
```
X   LT LG C RG RT   Y
            Q
        F
    H

Ball: Q tosses to H
H path: catch at landmark, run outside hip of RT
F: lead to force defender
Y: stalk or crack by rule
Backside OL: cut off pursuit
```
- Rationale: Creates clear edge landmark, teaches leverage and pursuit both sides
- Metrics: Perimeter gain, edge reached, ball security
- Error: Back bubbles too deep → cone dots for catch point and alley

**QB Follow / Power**
- Rationale: Good when exchanges are stronger than passing game
- Steps: Teach double-team/lead/follow landmarks
- Error: QB outruns blocker → walk pathing, "heels of blocker" cue

**Counter / Reverse Action**
- Rationale: Punishes overpursuit common in youth football
- Install ONLY after sweep mesh is clean
- Error: Mesh confusion → identical initial picture is non-negotiable prerequisite

**Boot / Sprint-Out Pass**
- Rationale: Simple half-field reads, protects young QBs
- Steps: Sell run → edge protection → read flat-to-deep
- Error: QB drifting backward → paint launch point, cone pocket

---

## Defensive Fundamentals

### Position Groups

**Defensive Line**
- Prerequisites: stance → get-off on cadence → gap landmark → strike/extension on bags → peek-and-shed → pursuit
- Drills: Get-off stick, step-and-shock on shield, read-block mirror, cone pursuit
- Metrics: Offsides down, proper gap fit ≥ 85%
- Error: Wild penetration → reduce front complexity, add "near knee through line" cue

**Linebackers**
- Prerequisites: stance → key read → shuffle downhill → fit with leverage → tackle finish
- Drills: Shuffle-read-react, cone scrape, fit-and-freeze, angle tackle
- Metrics: Missed fits and overrun rate
- Error: False-stepping → simplify keys to "backfield triangle"

**Defensive Backs**
- Prerequisites: stance → pedal → break → overlap landmark → catch point → tackle leverage
- Drills: W-drill, pedal-break-drive, zone landmark cones, over-the-shoulder locate
- Metrics: Cushion integrity, ball-in-air tracking, support tackle completion
- Error: Eyes to QB too soon → rep "man eyes/zone eyes" in walk-throughs

**Edge / Force Players**
- Priority: Most youth explosive plays happen on the edge
- Prerequisites: align → keep outside arm free → declare force/spill → pursue inside-out
- Drills: Force box drill, crack-replace walk-through
- Metrics: Outside contain success rate
- Error: Edge collapses inward → cones to mark no-cross strip

### Defensive Structure Recommendations

| Front | Best fit | Strengths | Weaknesses | Use |
|---|---|---|---|---|
| 6-2 or 5-3 | 6U–10U run-heavy | Simple edges, easy inside fits | Vulnerable to weak DB support | Strong beginner tackle structure |
| 4-4 | 10U–14U | Balanced vs youth run, flexible force | Requires LB discipline | Good all-around default |
| 4-2-5 / nickel-lite | 12U–14U or advanced flag | Better space defense | Demands strong DB tackling | Only after fit discipline is stable |
| Goal-line | All tackle ages | Clarifies heavy-run situations | Tempts overuse | Install as a situation, not identity |

### Core Defensive Concepts

**Base 4-4, Spill/Force vs Run**
```
CB --- deep 1/3 --- FS --- deep middle --- CB --- deep 1/3
      OLB curl/flat   ILB hook  ILB hook     OLB curl/flat
         DE   DT   DT   DE
```
- Steps: Define who sets edge, who spills, who overlaps, who fills cutback
- Metrics: Explosive runs allowed, missed force calls
- Error: Everyone chasing same gap → fit walk-through before team period

**Cover 3 / 3-Deep Zone**
- Steps: Teach thirds, curl/flat landmarks, hook landmarks, force support
- Metrics: Bust rate and completion rate allowed
- Error: Flats widening/hooks shallow → landmarks must be coned in indy

**Simple Pressure Tag**
- Install only one blitz from same shell and same coverage
- Pair pressure with one exact landmark
- Error: Blitz depth too flat → need exact landmark assignment

---

## Special Teams

> **CRITICAL**: Special teams is a rules-dependent domain. Before any install, verify:
> - Are kickoffs live?
> - Are punts live?
> - Is there a no-rush or no-line-up-over-snapper provision?
> - Is there a mandatory distance or dead-ball mechanic?

| Unit | Rationale | Steps | Metrics | Error | Fix |
|---|---|---|---|---|---|
| Punt safe/shield | Youth punting distance is limited; operation and field position matter more than hang time | Long snap → catch → step/kick or safe contingency | Operation time, clean catches, net field position | Slow operation | Reduce protection menu, rep one launch point |
| Kickoff cover | If live by rule, lane integrity > hero tackles | Align lanes → leverage landmark → gather and finish | Return average, lane busts | Coverage collapses to ball | Paint lanes, assign jersey-color landmarks |
| PAT / conversion | High leverage, low install cost | One primary + one counter off same picture | Conversion rate | Communication misses | Lock one cadence, one formation |
| Return | Fielding skill > return design at youth level | Catch decision → secure → first two blocks → vertical entry | Ball security, clean fielding % | Muffs | "Secure first, return second" priority |

**Safe Punt Concept**
```
Gunner  Wing  G  C  G  Wing  Gunner
                  P

Rules:
- Snap to consistent depth
- Wings protect edge first
- Gunners release only if rules allow
- Bad snap: P rolls safe side or eats by rule/field position
```

---

## Common Youth Problems — Correction Tree

| Problem | Likely cause | Correction | Measure | Troubleshooting |
|---|---|---|---|---|
| Overpursuit on sweep/counter | No force/spill clarity, poor eye discipline | Walk-through force call → half-speed pursuit lanes → counter recognition period | Cutback explosives allowed | Reduce pursuit language to outside/inside-out/backside |
| Arm tackling | Chasing collision instead of leverage | Breakdown → near-foot → fit-and-freeze → control → thud | Tackle finish rate | Remove live reps, rebuild angle entry |
| Bad snaps | Grip/stance inconsistency or fatigue | Snap only → snap-and-step → snap-to-play clock | Snap accuracy by type | Move center reps earlier in practice if late-fatigue problem |
| Ball security issues | Loose carry, too much contact chaos too soon | Carry positions → traffic no-collision → strip-awareness cues | Balls on ground per practice | Reduce live reps, assign every coach to ball-security language |
| Pre-snap busts | Too many calls, shifting terminology | Shrink menu, wristband/visual system, rehearse huddle | Alignment bust rate | Cut the formation causing most errors for two weeks |
| Explosive plays allowed | Edge or gap discipline breakdown | Identify whether it's a force, gap, or pursuit failure from film first | Explosive play rate (10+ yard gains) | Fix the specific failure type — don't change entire scheme |

---

## Practice Planning Framework

### Season Phases

```
Orientation → Fundamentals → Core Install → Situational → Refinement → Review
```

| Phase | Primary goal | Contact emphasis | Film/data emphasis |
|---|---|---|---|
| Orientation | Standards, equipment fit, baseline movement | Minimal | Baseline skill checks |
| Fundamentals | Install contact system, base football movements | Air/Bags/Control dominate | Track fundamentals mastery |
| Core install | Small play/call menu | Thud only where necessary | Tag base plays and busts |
| Situational | Down-and-distance, red zone, PAT, clock | Maintain limits | Opponent tendency + self-scout |
| Refinement | Improve execution, reduce volume | Reduce impact, preserve freshness | Trend review, "top three fixes" |
| Review | Reflect and progress | N/A | Update player profiles for next season |

### Weekly Microcycle (in-season, 3 practices + game)

| Day | Focus | Structure | KPI |
|---|---|---|---|
| Early week | Correct and teach | Dynamic warmup → indy → group → core install → short team | Assignment + technique corrections |
| Midweek | Best competitive practice | Warmup → indy → team run/pass → special teams → situational | Execution under moderate stress |
| Late week | Sharpen and polish | Walk-through → starts → special situations → PAT → communication | Bust-free tempo, readiness |
| Game day | Compete safely | Pre-game routine, call sheet discipline, injury reporting | Effort, execution, availability |

### Daily Practice Template

| Segment | Minutes | Content | Measure |
|---|---:|---|---|
| Arrival and readiness | 5–10 | Roll, hydration, injury check, objective | On-time rate |
| Dynamic warm-up | 8–12 | Progressive movement prep | Completion |
| Individual (indy) | 12–20 | Position fundamentals, drill stations | Rep quality |
| Group | 8–15 | 2–3 position groups together | Combination execution |
| Special teams | 5–10 | One unit per day | Unit KPI |
| Team period | 10–20 | Run, pass, or scripted situations | Bust rate, execution rate |
| Situational | 5–10 | One specific situation | Situation conversion rate |
| Cool-down + review | 5 | Communicate objective outcome + preview next session | Retention check |

---

## Safety Non-Negotiables

> These are hard constraints. PlayScoutIQ must surface these proactively during practice planning and game-day recommendations.

### Practice Contact Limits (USA Football)
- Respect age-banded duration and frequency recommendations
- No two-a-days for youth
- Progressive contact levels — never jump to full-speed player-to-player contact without proper progression
- Track cumulative contact across the week, not just per session

### Prohibited High-Risk Drills
The following drills should **never be recommended** by PlayScoutIQ:
- Oklahoma drill (live full-speed collision with no escape)
- Bull in the Ring
- Board drills involving collision-only outcomes
- Any drill where the only outcome is a head-on collision with no technique objective

### Concussion Protocol (CDC guidelines)
1. **Same-day removal** — any suspected concussion = out for the rest of that day
2. Graduated return-to-play under medical supervision
3. No same-day return regardless of symptom resolution
4. PlayScoutIQ should flag any report of head contact with follow-up prompt: "Has this player been cleared by a medical professional?"

### Heat Acclimatization
- Deliberate multi-day heat acclimatization for preseason
- Modify practice intensity/duration based on heat index
- Mandatory hydration breaks
- Emergency cooling plan required before any outdoor practice in high-heat conditions

### Emergency Action Plan (NATA)
- Venue-specific EAP must be written and rehearsed before season begins
- EAP must include: AED location, emergency contacts, nearest hospital, heat emergency response, lightning protocol
- PlayScoutIQ should prompt for EAP confirmation at start of each season

### Equipment
- All helmets must meet NOCSAE certification
- Equipment must be properly fit by a qualified person — not self-fitted
- Inspect equipment at start of season and after any significant impact event

---

## Skill + Scheme Progression Map

| Area | 6U | 8U | 10U | 12U | 14U |
|---|---|---|---|---|---|
| Movement | Start, stop, chase, dodge, balance | Angles, hip turns, shuffle, break down | COD, pursuit leverage, deceleration | Multi-directional reaction | Game-speed movement economy |
| Football handling | Carry, exchange, basic catch | Handoff, snap intro, stationary throw | Mesh, moving catch, hand placement | Timing throws, under-center + gun | Situational handling under pressure |
| Contact | No-contact or fit-and-freeze | Limited contact; near-foot, leverage | Controlled block/tackle progressions | Full technique under limits | Advanced fit, finish, recovery |
| Scheme | Formation recognition only | 4–6 core plays, 1–2 coverages max | 6–10 core plays, 1 front family + adjustment | Complementary run/pass menu, simple checks | Situational packages — still lean |
| Decision-making | Find ball, go to space | Follow simple rules | Read one defender or one picture | Use formation and leverage clues | Use situation, tendency, and alerts |
| Film/data | Visual review of effort and spacing | Simple play grades | Tag basic tendencies | Install scouting reports | Situational self-scout + opponent scouting |

---

## PlayScoutIQ Response Rules Using This Knowledge Base

When answering coach questions, PlayScoutIQ must:

1. **Check age band first** — every recommendation is filtered through age_group before output
2. **Check game type** — flag answers ≠ tackle answers; verify rule set before any contact or scheme recommendation
3. **Check prerequisites** — if the team hasn't mastered the prerequisite, recommend that first
4. **Cite the source tier** — "Based on USA Football's FDM..." or "Per CDC concussion guidelines..." or "This is a PlayScout synthesis based on..."
5. **Flag safety constraints** — any recommendation involving contact must include relevant safety flags from this document
6. **Recommend small menus** — default to fewer plays, fewer calls, more reps
7. **Never recommend prohibited drills** — Oklahoma, Bull in the Ring, and board collision drills are always off the menu
8. **Escalate unknown rule questions** — "This may vary by your local league. Please verify with your league director before installing."
9. **Separate observation from recommendation** — "The film shows X. Based on that, I recommend Y."
10. **Use Perplexity for rules/scheme questions outside film data** — clearly label: "This answer is based on general football knowledge, not your team's film."

---

## Coaching Leadership Framework

| Pillar | Implementation | Metrics | Troubleshooting |
|---|---|---|---|
| Be clear | One term per concept, one correction at a time, one visual, then rep it | Fewer pre-snap errors, faster reset between reps | Reduce vocabulary, shorten install |
| Be consistent | Same terminology, same cadence words, same drill names across all coaches | Players can explain their own assignment | Publish staff lexicon if language drifts |
| Be relational | Greet players, specific praise, ask for athlete input, separate mistake from identity | Higher attendance, better effort, more athlete voice | Increase autonomy, private correction |
| Be developmental | Limit play menu, rotate positions early, layer complexity only after mastery | More athletes can play multiple roles | Scale back complexity if only 2 players can run the offense |
| Be accountable | Publish team rules, role clarity, attendance expectations, injury-reporting norms | Lower penalty rate, fewer missed meetings | Add pre-practice huddles, parent reminders |

---

## Tendency Library — What Youth Teams Do

These are the most common tendencies PlayScoutIQ should look for when a coach asks about opponent scouting or self-scouting:

**Offense**
- Perimeter run tendency (sweep, toss, jet) — most common youth weapon
- Off-tackle tendency — inside gap runs to the strong side
- Motion-heavy offense — jet motion, wing motion to create leverage
- Misdirection-heavy — counter, reverse after establishing perimeter
- Formation clustering — tendency to align to one hash or formation

**Defense**
- Overpursuit on perimeter — creates counter/reverse opportunity
- Inside-out gap losses — leaving backside cutback open
- Soft edge — force player not setting edge, allowing outside runs
- Coverage busts on motion — defense fails to communicate motion adjustment
- Poor leverage tackling — arm tackling, over-running ballcarriers

**Both sides**
- Down-and-distance tendency — what do they run on 3rd and short?
- Field position tendency — do they change scheme in their own red zone?
- Clock situation errors — poor time management in final 2 minutes

---

## Key Terms Glossary

| Term | Definition |
|---|---|
| Force | The defender responsible for turning a perimeter run back inside |
| Spill | Running the ball back into defenders pursuing from inside |
| Gap | Defined running lane between or outside offensive linemen |
| Leverage | Body position advantage — low man wins |
| Mesh | The handoff exchange between QB and RB |
| Pad level | How low a player's hips and pads are relative to their opponent |
| Pursuit | The path a defender takes to intercept the ballcarrier |
| Stem | The first portion of a route before a break |
| Landmark | A specific field yard or hash marker used as an alignment or route target |
| Thud | A contact level where players engage but don't take to the ground |
| Air | No-contact practice period — players execute routes and assignments without opposition |
| Tendency | A statistically repeated behavior visible across multiple plays |
| Sample size | The number of plays used to establish a tendency — always report this |
| Confidence | How certain a conclusion is given the available evidence (0.0–1.0) |
