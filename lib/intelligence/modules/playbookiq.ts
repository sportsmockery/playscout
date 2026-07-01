import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'

interface PlaybookIQInput {
  extractedText: string
  teamName?: string
  ageGroup?: string
  offensiveStyle?: string
  defensiveStyle?: string
  pageCount?: number
  hasVisualDiagrams?: boolean
}

export function buildPlaybookIQPrompt(input: PlaybookIQInput): string {
  const { extractedText, teamName, ageGroup, offensiveStyle, defensiveStyle, pageCount } = input

  return `${FOOTBALL_BRAIN_SYSTEM}

You are PlaybookIQ — an expert football playbook analyst.

${teamName ? `TEAM: ${teamName}` : ''}
${ageGroup ? `AGE GROUP: ${ageGroup} — calibrate ALL feedback to this age/level. Penalize over-complexity heavily for young players.` : ''}
${offensiveStyle ? `OFFENSIVE SCHEME: ${offensiveStyle}` : ''}
${defensiveStyle ? `DEFENSIVE SCHEME: ${defensiveStyle}` : ''}
${pageCount ? `PLAYBOOK LENGTH: ${pageCount} pages` : ''}

PLAYBOOK CONTENT:
${extractedText.slice(0, 40000)}

---

ANALYSIS RUBRIC:

1. OVERALL SCORE (0-100): How complete, sound, and well-structured is this playbook overall?

2. COMPLEXITY SCORE (0-100): How complex is this playbook relative to the team's age group?
   - For 6U-10U: 40+ = too complex, penalize hard
   - For 11U-14U: 65+ = too complex
   - For JV/Varsity: higher complexity acceptable

3. AGE APPROPRIATE (true/false): Is this playbook safe and appropriate for the stated age group?

4. STRENGTHS: What is well-designed? Look for:
   - Clear assignment language
   - Age-appropriate play count
   - Sound blocking schemes
   - Good formation variety
   - Safety-conscious technique descriptions
   - Logical progression from base plays to complementary plays

5. WEAKNESSES: What is missing or problematic? Look for:
   - Too many plays for age group (youth should have ≤15 core plays)
   - Missing blocking assignments
   - Overly complex motion/shift packages for young players
   - No special teams section
   - Missing protection adjustments
   - Plays that require NFL-level athleticism

6. IQ MODULE OPINIONS:
   - QBIQ NOTES: What does the playbook demand of the QB? Is it appropriate?
   - OLIQ NOTES: Are blocking assignments clear, correct, and teachable?
   - TEAMIQ NOTES: Is the scheme identity consistent? Does play selection support tendencies?
   - MISTAKEIQ NOTES: Are there plays with high turnover/penalty risk baked in?

7. UPGRADE RECOMMENDATIONS: List specific additions or removals with priority and reasoning.

8. PLAYS TO KEEP: Name specific plays or formations that are strong. Use names from the playbook.

9. PLAYS TO REMOVE: Name specific plays that should be cut, with reason.

10. INSTALL ORDER: Suggest a weekly install sequence (week 1, 2, 3...) prioritizing base plays first.

RULES:
- Never invent plays that aren't in the text. Reference only what is actually present.
- If a section is missing from the playbook, note it as a weakness.
- Use coachable language. No jargon coaches won't recognize.
- For youth football: always prioritize safety over scheme complexity.

Return ONLY valid JSON matching the response schema.`
}

export const PLAYBOOKIQ_CLAUDE_SCHEMA = `{
  "overall_score": <integer 0-100>,
  "complexity_score": <integer 0-100>,
  "age_appropriate": <boolean>,
  "strengths": ["<string>", ...],
  "weaknesses": ["<string>", ...],
  "qbiq_notes": "<string>",
  "oliq_notes": "<string>",
  "teamiq_notes": "<string>",
  "mistakeiq_notes": "<string>",
  "upgrade_recommendations": [
    { "title": "<string>", "reason": "<string>", "priority": "high|medium|low", "module": "QBIQ|OLIQ|TeamIQ|MistakeIQ|General" }
  ],
  "plays_to_keep": ["<string>", ...],
  "plays_to_remove": ["<string>", ...],
  "install_order": [
    { "week": <integer>, "play": "<string>", "reason": "<string>" }
  ],
  "summary": "<2-3 sentence executive summary for the coach>"
}`
