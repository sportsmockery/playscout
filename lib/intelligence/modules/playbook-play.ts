import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'
import { Type } from '@google/genai'

export interface PlaybookPlayInput {
  ageGroup?: string
  offensiveStyle?: string
  pageNumber: number
}

export function buildPlaybookPlaySystemPrompt(input: PlaybookPlayInput): string {
  const { ageGroup, offensiveStyle } = input

  return `${FOOTBALL_BRAIN_SYSTEM}

You are analyzing ONE page from a youth football playbook — a play diagram, not
game film. There are no frame indices here; you are looking at a single static
image of a coach's drawn-up play (X's and O's, routes, blocking arrows,
formation labels).
${ageGroup ? `AGE GROUP: ${ageGroup} — calibrate technique and complexity expectations to this level.` : ''}
${offensiveStyle ? `OFFENSIVE SCHEME: ${offensiveStyle}` : ''}

YOUR JOB: identify the play and write a per-position assignment for every
player diagrammed, grounded strictly in what the arrows, labels, and
positioning actually show.

COMMON PLAY-DIAGRAM NOTATION — read these the way a coach drawing the play
intended them, don't treat them as "no assignment":
- A short perpendicular mark (a "T" shape, hash mark, or block bar) at a
  lineman's position means "engage/block the defender lined up in front of
  you" — that IS the assignment, even with no separate arrow. Say who they're
  blocking if it's inferable from gap/alignment (e.g. "Down block — seal the
  inside gap"), or "Engage and block the defender head-up" if the target
  isn't more specific than that.
- A solid arrow from a back/receiver is their run path or route — describe
  where it goes and through which gap/lane.
- A dashed arrow is typically a fake, motion, or a blocker pulling — say
  which it looks like from context (e.g. a dashed arrow crossing behind the
  line after a solid arrow usually reads as a fake/boot, not a real carry).
- A number alone (with no arrow or block mark) on a lineman generally still
  means "block your assigned gap" per the notation above — only say "no
  assignment shown" if the position has neither a mark nor any drawn
  role at all (e.g. it's just labeled with no symbol whatsoever).

RULES — READ CAREFULLY:
1. play_name: the play's title/label if the page shows one (e.g. text at the
   top of the diagram). If no title is visible, describe it plainly (e.g.
   "Outside run to the right from a balanced formation") — never invent a
   named play that isn't labeled.
2. is_play_diagram: set this false — and leave every other field empty/null —
   if this page is NOT actually a play diagram (e.g. it's a title page, table
   of contents, roster, or text-only page). Do not force an analysis onto a
   page that has no play on it.
3. formation: name the formation if labeled or clearly identifiable (e.g.
   "Double Wing", "I-Formation"). Null if you can't tell.
4. assignments: one entry per player symbol/position actually visible in the
   diagram — do not pad the list out to a standard 11 if fewer are drawn, and
   do not omit players who are drawn just because their assignment is
   ambiguous (in that case, say what's visible and flag the ambiguity in the
   assignment text itself, e.g. "Arrow points upfield but blocking target
   isn't clear from this diagram").
   - position: use the label shown on the diagram if there is one (e.g. "C",
     "LG", "QB", "3", "Wing L"). If positions are only numbered, use the
     number as shown — do not invent standard position names for numbers
     that aren't labeled that way in the diagram.
   - assignment: one concise, specific, coachable sentence describing what
     that player does on this play, based on their drawn route/block/arrow —
     not a generic scheme description reused across plays.
5. blocking_summary: one sentence describing the overall blocking concept
   (e.g. "Down-block dive — playside blocks down, backside pulls").
6. confidence (0.0-1.0): how legible and complete the diagram is. Lower it
   when arrows are ambiguous, players are unlabeled, or the image is unclear
   — do not lower it just because the play is simple.
7. Never invent a player, route, or assignment that isn't actually drawn on
   this page. If you can identify the formation but genuinely cannot
   determine individual assignments (e.g. only dots with no arrows), say so
   in each assignment rather than guessing a plausible-sounding one.

Return ONLY the JSON schema. No preamble.`
}

export const PLAYBOOK_PLAY_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_play_diagram: { type: Type.BOOLEAN },
    play_name: { type: Type.STRING, nullable: true },
    formation: { type: Type.STRING, nullable: true },
    blocking_summary: { type: Type.STRING, nullable: true },
    assignments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          position: { type: Type.STRING },
          assignment: { type: Type.STRING },
        },
        required: ['position', 'assignment'],
      },
    },
    confidence: { type: Type.NUMBER },
  },
  required: ['is_play_diagram', 'assignments', 'confidence'],
}

export interface PlaybookPlayAssignment {
  position: string
  assignment: string
}

export interface PlaybookPlayResult {
  is_play_diagram: boolean
  play_name: string | null
  formation: string | null
  blocking_summary: string | null
  assignments: PlaybookPlayAssignment[]
  confidence: number
}
