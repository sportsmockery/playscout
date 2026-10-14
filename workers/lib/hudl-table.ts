/**
 * Reads the breakdown off the play table under Hudl's video player.
 *
 * Hudl's analyze view shows every clip's breakdown — PLAY #, ODK, DN, DIST,
 * YARD LN, HASH, OFF FORM, … QTR — in a grid below the video, one row per clip
 * in playlist order. None of it arrived in the JSON the playlist reader parses
 * (309 clips across four imports came in with no down or distance), so it is
 * read from the grid itself.
 *
 * The grid's markup is Hudl's and undocumented, so the reader is geometric
 * rather than tied to class names: find the header cell reading "ODK", take
 * the header cells level with it as the columns, then file every text cell
 * below into the column it sits under and the row it sits on. The grid is
 * virtualised (only the rows on screen exist), so it is scrolled through and
 * rows are collected by their position in the scrolled content.
 *
 * Pairing rows with clips is by order and only when the counts match exactly.
 * One missing or extra row would put every play's down and distance on its
 * neighbour, which is worse than no breakdown.
 */
import type { Page } from 'playwright'
import type { HudlClipCandidate } from './hudl-playlist'

export interface TableSnapshot {
  header: { text: string; left: number }[]
  cells: { text: string; x: number; y: number }[]
  atEnd: boolean
}

const ROW_TOLERANCE_PX = 8
const PLAY_NUMBER_HEADER = /^play\s*(#|no\.?|number)?$/i
const MAX_SCROLL_PASSES = 80

/**
 * Builds `{ column: value }` rows from one or more snapshots of the grid.
 * Pure. Rows are returned top to bottom; a row seen in two snapshots is kept
 * once (by its PLAY # when the grid has one, otherwise by its position).
 */
export function assembleTable(snapshots: TableSnapshot[]): Record<string, string>[] {
  const header = snapshots.find((s) => s.header.length)?.header
  if (!header?.length) return []
  const columns = [...header].sort((a, b) => a.left - b.left)
  const columnFor = (x: number): string | null => {
    let found: string | null = null
    for (const col of columns) {
      if (x >= col.left - 6) found = col.text
      else break
    }
    return found
  }

  const rows = new Map<number, { y: number; record: Record<string, string> }>()
  for (const snap of snapshots) {
    const cells = [...snap.cells].sort((a, b) => a.y - b.y)
    let current: { y: number; record: Record<string, string> } | null = null
    for (const cell of cells) {
      if (!current || cell.y - current.y > ROW_TOLERANCE_PX) {
        const key = Math.round(cell.y / ROW_TOLERANCE_PX)
        current = rows.get(key) ?? rows.get(key - 1) ?? rows.get(key + 1) ?? { y: cell.y, record: {} }
        rows.set(Math.round(current.y / ROW_TOLERANCE_PX), current)
      }
      const column = columnFor(cell.x)
      const text = cell.text.replace(/\s+/g, ' ').trim()
      if (column && text && !(column in current.record)) current.record[column] = text
    }
  }

  const ordered = [...rows.values()].sort((a, b) => a.y - b.y).map((r) => r.record)
  const playKey = columns.map((c) => c.text).find((t) => PLAY_NUMBER_HEADER.test(t))
  if (!playKey) return ordered.filter((r) => Object.keys(r).length > 0)

  // Keyed by PLAY # so a row caught at two scroll offsets counts once, and a
  // stray line of text with no play number (a footer, a tooltip) is not a row.
  const byPlay = new Map<string, Record<string, string>>()
  for (const record of ordered) {
    const play = record[playKey]
    if (!play || !/^\d+$/.test(play)) continue
    byPlay.set(play, { ...(byPlay.get(play) ?? {}), ...record })
  }
  return [...byPlay.values()]
}

/**
 * Gives each clip its row from the table, in order — only when there is
 * exactly one row per clip and, if the grid numbers its plays, the numbers
 * run in order. Anything else returns the clips unchanged.
 */
export function pairTableWithClips(
  clips: HudlClipCandidate[],
  rows: Record<string, string>[]
): { clips: HudlClipCandidate[]; paired: number; reason?: string } {
  if (!rows.length) return { clips, paired: 0, reason: 'no table rows read' }
  if (rows.length !== clips.length) {
    return { clips, paired: 0, reason: `table has ${rows.length} rows for ${clips.length} clips` }
  }
  const playKey = Object.keys(rows[0]).find((k) => PLAY_NUMBER_HEADER.test(k))
  if (playKey) {
    const numbers = rows.map((r) => Number(r[playKey]))
    if (numbers.some((n, i) => !Number.isFinite(n) || (i > 0 && n <= numbers[i - 1]))) {
      return { clips, paired: 0, reason: 'play numbers are not in order' }
    }
  }
  return {
    // The table REPLACES what the JSON reader guessed were columns: on real
    // Hudl payloads those were stray fields like `seasonId`, not breakdown.
    clips: clips.map((clip, i) => ({ ...clip, columns: rows[i] })),
    paired: clips.length,
  }
}

/**
 * Snapshots the grid from top to bottom. Returns no snapshots when the page
 * has no play table, which the caller reports rather than treats as an error.
 */
export async function readHudlPlayTable(page: Page): Promise<TableSnapshot[]> {
  const snapshots: TableSnapshot[] = []
  for (let pass = 0; pass < MAX_SCROLL_PASSES; pass++) {
    const snap = await page.evaluate(snapshotGrid, pass === 0).catch(() => null)
    if (!snap || !snap.header.length) break
    snapshots.push(snap)
    if (snap.atEnd) break
    await page.waitForTimeout(350)
  }
  return snapshots
}

/**
 * Runs IN THE PAGE. Self-contained: Playwright serialises it, so it cannot
 * reach anything outside its own body.
 */
function snapshotGrid(reset: boolean): TableSnapshot {
  const norm = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim()
  const visible = (r: DOMRect) => r.width > 0 && r.height > 0
  const leaves = (root: Element) =>
    Array.from(root.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && norm(el.textContent) && visible(el.getBoundingClientRect())
    )

  // The grid's ODK header sits below the video; the overlay strip on the
  // video carries one too, so take the lowest.
  const odkCells = leaves(document.body).filter((el) => norm(el.textContent).toUpperCase() === 'ODK')
  if (!odkCells.length) return { header: [], cells: [], atEnd: true }
  const odk = odkCells.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0]
  const odkRect = odk.getBoundingClientRect()

  // Climb until the ancestor also holds DN and DIST: that is the header row's scope.
  let scope: Element | null = odk.parentElement
  while (scope && scope !== document.body) {
    const texts = leaves(scope).map((el) => norm(el.textContent).toUpperCase())
    if (texts.includes('DN') && texts.includes('DIST')) break
    scope = scope.parentElement
  }
  if (!scope) return { header: [], cells: [], atEnd: true }

  const header = leaves(scope)
    .filter((el) => Math.abs(el.getBoundingClientRect().top - odkRect.top) < 6)
    .map((el) => ({ text: norm(el.textContent), left: el.getBoundingClientRect().left }))

  // The body scroller: the scrollable element below the header.
  let grid: Element | null = document.querySelector('[data-playscout-grid]')
  if (!grid) {
    let root: Element | null = scope
    for (let up = 0; up < 6 && root && !grid; up++, root = root.parentElement) {
      const candidates = [root, ...Array.from(root.querySelectorAll('*'))].filter((el) => {
        const style = getComputedStyle(el)
        return (
          /(auto|scroll)/.test(style.overflowY) &&
          el.scrollHeight > el.clientHeight + 10 &&
          // The play list starts at the header or below it. A taller scroller
          // elsewhere (Hudl's game list on the right) must not be taken.
          el.getBoundingClientRect().top >= odkRect.top - 6 &&
          el.getBoundingClientRect().bottom > odkRect.bottom &&
          el.getBoundingClientRect().left <= odkRect.left
        )
      })
      grid = candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? null
    }
    grid?.setAttribute('data-playscout-grid', '1')
  }

  if (grid && reset) grid.scrollTop = 0
  const gridRect = grid?.getBoundingClientRect()
  const offset = grid ? grid.scrollTop - (gridRect?.top ?? 0) : window.scrollY

  const cells = leaves(grid ?? document.body)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.top > odkRect.bottom - 2 && (!gridRect || (r.top >= gridRect.top && r.bottom <= gridRect.bottom + 2)))
    .map(({ el, r }) => ({ text: norm(el.textContent), x: r.left + r.width / 2, y: r.top + offset }))

  let atEnd = true
  if (grid) {
    const before = grid.scrollTop
    grid.scrollTop = before + Math.max(40, grid.clientHeight * 0.8)
    atEnd = grid.scrollTop === before
  }
  return { header, cells, atEnd }
}
