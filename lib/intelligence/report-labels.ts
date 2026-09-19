/**
 * Coach-facing names for the report a module produces.
 *
 * The report pages printed the raw module key and nothing else — "SCOUTIQ ·
 * Combined Report" is how the product refers to itself internally, not how a
 * coach would describe the sheet they are carrying to a field. The key stays
 * (it is what the coach clicked), but it now sits above a line that says what
 * the sheet IS.
 */
export function moduleReportKind(moduleKey: string | null | undefined): string {
  switch ((moduleKey ?? '').toUpperCase()) {
    case 'QBIQ':
      return 'Quarterback Film Report'
    case 'OLIQ':
      return 'Offensive Line Film Report'
    case 'RBIQ':
      return 'Running Back Film Report'
    case 'WRIQ':
      return 'Receiver Film Report'
    case 'DLIQ':
      return 'Defensive Line Film Report'
    case 'LBIQ':
      return 'Linebacker Film Report'
    case 'DBIQ':
      return 'Defensive Back Film Report'
    case 'TEAMIQ':
      return 'Team Tendency Report'
    case 'MISTAKEIQ':
      return 'Mistake Report'
    case 'SCOUTIQ':
      return 'Opponent Scouting Report'
    case 'RANKERIQ':
      return 'Player Grade Report'
    case 'STATSIQ':
      return 'Box Score — Charted From Film'
    case 'PRACTICEIQ':
      return 'Practice Plan'
    case 'PLAYBOOKIQ':
      return 'Playbook Report'
    default:
      return 'Film Report'
  }
}

/**
 * A date on a sheet that will be read next week, printed, and filed. `9/19/2026`
 * is ambiguous outside the US and unreadable at a glance either way.
 *
 * Fixed to en-US rather than the runtime locale on purpose: these pages are
 * server-rendered, so the server's locale — not the coach's — is what a bare
 * `toLocaleDateString()` would pick up.
 */
export function formatReportDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
