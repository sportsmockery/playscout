import { describe, it, expect } from 'vitest'
import { groupByTitleStem, titleStem } from './title-groups'

describe('titleStem', () => {
  it('strips the running clip number in the formats film actually arrives in', () => {
    expect(titleStem('Andrew vs. Bourbonnais — Clip 88')).toEqual({ stem: 'Andrew vs. Bourbonnais', sequence: 88 })
    expect(titleStem('LWE vs BR - Clip 3')).toEqual({ stem: 'LWE vs BR', sequence: 3 })
    expect(titleStem('IMG_7296')).toEqual({ stem: 'IMG', sequence: 7296 })
    expect(titleStem('Week 4 Play #12')).toEqual({ stem: 'Week 4', sequence: 12 })
    expect(titleStem('Scrimmage (4)')).toEqual({ stem: 'Scrimmage', sequence: 4 })
  })

  it('leaves a title with no running number alone', () => {
    expect(titleStem('Full game — Bradley')).toEqual({ stem: 'Full game — Bradley', sequence: null })
  })

  it('does not reduce a bare number to an empty stem', () => {
    expect(titleStem('0072')).toEqual({ stem: '0072', sequence: null })
  })
})

describe('groupByTitleStem', () => {
  const v = (title: string) => ({ title })

  it('never mixes two games that share only the clip label', () => {
    const groups = groupByTitleStem([
      v('Andrew vs. Bourbonnais — Clip 12'),
      v('LWE vs BR — Clip 12'),
      v('Andrew vs. Bourbonnais — Clip 3'),
      v('LWE vs BR — Clip 1'),
    ])
    expect(groups.map((g) => g.name)).toEqual(['Andrew vs. Bourbonnais', 'LWE vs BR'])
    expect(groups[0].items.map((i) => i.title)).toEqual([
      'Andrew vs. Bourbonnais — Clip 3',
      'Andrew vs. Bourbonnais — Clip 12',
    ])
  })

  it('orders clips numerically, so 2 comes before 10', () => {
    const [group] = groupByTitleStem([v('G — Clip 10'), v('G — Clip 2'), v('G — Clip 1')])
    expect(group.items.map((i) => i.title)).toEqual(['G — Clip 1', 'G — Clip 2', 'G — Clip 10'])
  })

  it('treats case and spacing differences as the same game', () => {
    const groups = groupByTitleStem([v('LWE vs BR — Clip 1'), v('lwe  vs br — Clip 2')])
    expect(groups).toHaveLength(1)
  })

  it('keeps one-off titles as groups of one for the caller to render flat', () => {
    const groups = groupByTitleStem([v('Full game'), v('G — Clip 1'), v('G — Clip 2')])
    expect(groups.map((g) => g.items.length)).toEqual([1, 2])
  })
})
