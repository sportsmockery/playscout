/**
 * Groups film by how its title starts, so a game cut into 109 clips is one
 * selectable row instead of 109.
 *
 * A Hudl export or a phone dump names its clips "Andrew vs. Bourbonnais — Clip
 * 88" or "IMG_7296": a shared stem plus a running number. The stem is the game
 * (or the camera roll); the number is the play. Selecting "every clip of this
 * game" is the normal unit of work for every module, and before this the only
 * way to do it was a folder or 109 clicks.
 *
 * Only the TRAILING number is stripped. "LWE vs BR — Clip 12" and "Andrew vs.
 * Bourbonnais — Clip 12" share nothing but the clip label, and the whole point
 * is that they never mix.
 */

/** "— Clip 88", " - Play 3", " #12", "_7296", " (4)", " 07" at the end of a title. */
const TRAILING_SEQUENCE =
  /[\s_\-–—:#·|.]*(?:\((\d+)\)|(?:clip|play|part|snap|cut)?[\s_#.]*(\d+))\s*$/i

export interface TitleStem {
  /** What the clips have in common, shown as the group's name. */
  stem: string
  /** The running number, for ordering clips 2 before 10. Null when there is none. */
  sequence: number | null
}

export function titleStem(title: string): TitleStem {
  const trimmed = title.trim()
  const match = trimmed.match(TRAILING_SEQUENCE)
  if (!match || match.index === undefined) return { stem: trimmed, sequence: null }
  const stem = trimmed.slice(0, match.index).trim()
  // A title that is ONLY a number has no stem worth grouping on.
  if (!stem) return { stem: trimmed, sequence: null }
  return { stem, sequence: Number(match[1] ?? match[2]) }
}

/** Case- and whitespace-insensitive, so "LWE vs BR" and "lwe  vs br" are one game. */
function stemKey(stem: string): string {
  return stem.toLowerCase().replace(/\s+/g, ' ')
}

export interface TitleGroup<T> {
  key: string
  name: string
  items: T[]
}

/**
 * Splits film into title groups, keeping the input order of the groups (first
 * appearance) and ordering each group by its running number. A stem that only
 * one clip has is returned as a group of one, which the caller renders as a
 * plain row — a header over a single clip is noise.
 */
export function groupByTitleStem<T extends { title: string }>(items: T[]): TitleGroup<T>[] {
  const groups = new Map<string, { name: string; entries: { item: T; sequence: number | null; at: number }[] }>()
  items.forEach((item, at) => {
    const { stem, sequence } = titleStem(item.title)
    const key = stemKey(stem)
    const group = groups.get(key) ?? { name: stem, entries: [] }
    group.entries.push({ item, sequence, at })
    groups.set(key, group)
  })

  return [...groups.entries()].map(([key, { name, entries }]) => ({
    key,
    name,
    items: entries
      .sort((a, b) => {
        if (a.sequence != null && b.sequence != null && a.sequence !== b.sequence) {
          return a.sequence - b.sequence
        }
        return a.at - b.at
      })
      .map((e) => e.item),
  }))
}
