'use client'

import { Navbar } from '@/components/layout/navbar'

/* ------------------------------------------------------------------ *
 * Bulldogs 13U — Visual Play Diagrams
 * Self-contained SVG renderer (ported from the verified standalone).
 * All content is static, so the SVG is built as a string and injected
 * once — it server-renders and needs no client JS to display.
 * ------------------------------------------------------------------ */

const W = 260,
  H = 178,
  LOS = 118

const OL: Record<string, [number, number]> = {
  LT: [96, 124],
  LG: [113, 124],
  C: [130, 124],
  RG: [147, 124],
  RT: [164, 124],
}

const FORMS: Record<string, Record<string, [number, number]>> = {
  trips: { QB: [130, 150], RB: [112, 150], r3: [247, 120], r4: [213, 122], r6: [187, 124], r5: [17, 120] },
  twins: { QB: [130, 150], RB: [112, 150], r4: [243, 120], r3: [208, 122], r6: [181, 123], r5: [19, 120] },
  beast: { QB: [130, 145], RB: [130, 163], r6: [181, 123], r4: [199, 124], r3: [81, 123], r5: [63, 124] },
  doce: { QB: [130, 150], RB: [110, 150], r4: [245, 120], r3: [210, 122], r5: [15, 120], r6: [49, 122], r8: [130, 161] },
}
const LABEL: Record<string, string> = { QB: 'QB', RB: '2', r3: '3', r4: '4', r5: '5', r6: '6', r8: '8' }

type PathT = 'route' | 'run' | 'keep' | 'motion' | 'pull' | 'throw' | 'fake' | 'block'
type Pt = [number, number]
interface PlayPath {
  who?: string
  type: PathT
  pts: Pt[]
}
interface Play {
  no: number
  name: string
  kind: string
  form: string
  note: string
  read?: { id: string; label: string } // which of the 11 defenders is the read / point of attack
  paths?: PlayPath[]
}

const poly = (pts: Pt[]) => pts.map((p) => p.join(',')).join(' ')

/** Full 11-man base defense (4-3 look), corners aligned to the widest receivers. */
function buildDefense(form: string, read?: { id: string; label: string }) {
  const F = FORMS[form]
  const rx = Object.keys(F)
    .filter((k) => k[0] === 'r')
    .map((k) => F[k][0])
  const minx = Math.max(12, Math.min(...rx))
  const maxx = Math.min(248, Math.max(...rx))
  const base: [string, number, number][] = [
    ['DE_L', 90, 110],
    ['DT_L', 119, 110],
    ['DT_R', 141, 110],
    ['DE_R', 172, 110],
    ['LB_W', 106, 99],
    ['LB_M', 130, 99],
    ['LB_S', 154, 99],
    ['CB_L', minx, 106],
    ['CB_R', maxx, 106],
    ['S_L', 102, 62],
    ['S_R', 158, 62],
  ]
  return base.map(([id, x, y]) => ({
    x,
    y,
    hl: !!read && read.id === id,
    label: read && read.id === id ? read.label : '',
  }))
}

function markersDefs() {
  const mk = (id: string, color: string, scale: number) =>
    `<marker id="${id}" markerWidth="${6 * scale}" markerHeight="${6 * scale}" refX="4.6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L5,3 L0,6 Z" fill="${color}"/></marker>`
  return `<defs>${mk('aRoute', 'var(--bv-route)', 1)}${mk('aRun', 'var(--bv-run)', 0.9)}${mk('aMot', 'var(--bv-motion)', 1)}</defs>`
}

function fieldLines() {
  let s = ''
  for (let y = 20; y <= 100; y += 20)
    s += `<line x1="6" y1="${y}" x2="${W - 6}" y2="${y}" stroke="var(--bv-field-line)" stroke-width="1"/>`
  s += `<line x1="6" y1="${LOS}" x2="${W - 6}" y2="${LOS}" stroke="var(--bv-los)" stroke-width="1.6" stroke-dasharray="2 3" opacity="0.9"/>`
  return s
}

function pathStr(pts: Pt[], type: PathT) {
  const styles: Record<PathT, { stroke: string; w: number; dash: string | null; mk: string | null }> = {
    route: { stroke: 'var(--bv-route)', w: 2.3, dash: null, mk: 'aRoute' },
    run: { stroke: 'var(--bv-run)', w: 3.2, dash: null, mk: 'aRun' },
    keep: { stroke: 'var(--bv-run)', w: 2.6, dash: '5 3', mk: 'aRun' },
    motion: { stroke: 'var(--bv-motion)', w: 1.9, dash: '4 3', mk: 'aMot' },
    pull: { stroke: 'var(--bv-route)', w: 2.3, dash: null, mk: 'aRoute' },
    throw: { stroke: 'var(--bv-route)', w: 1.4, dash: '2 3', mk: 'aRoute' },
    fake: { stroke: 'var(--bv-motion)', w: 2, dash: '3 3', mk: 'aMot' },
    block: { stroke: 'var(--bv-route)', w: 2.3, dash: null, mk: null },
  }
  const s = styles[type]
  let out = `<polyline points="${poly(pts)}" fill="none" stroke="${s.stroke}" stroke-width="${s.w}" stroke-linejoin="round" stroke-linecap="round"${
    s.dash ? ` stroke-dasharray="${s.dash}"` : ''
  }${s.mk ? ` marker-end="url(#${s.mk})"` : ''}/>`
  if (type === 'block') {
    const a = pts[pts.length - 2],
      b = pts[pts.length - 1]
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      L = Math.hypot(dx, dy) || 1
    const nx = (-dy / L) * 4,
      ny = (dx / L) * 4
    out += `<line x1="${b[0] - nx}" y1="${b[1] - ny}" x2="${b[0] + nx}" y2="${b[1] + ny}" stroke="${s.stroke}" stroke-width="${s.w}" stroke-linecap="round"/>`
  }
  return out
}

function defenderStr(x: number, y: number, label: string, hl: boolean) {
  const col = hl ? 'var(--bv-def)' : 'var(--bv-dline)'
  let s = `<text x="${x}" y="${y + 4.6}" text-anchor="middle" font-size="${hl ? 13.5 : 12}" font-weight="700" fill="${col}" font-family="sans-serif">✕</text>`
  if (label) s += `<text x="${x}" y="${y - 7.5}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${col}">${label}</text>`
  return s
}

function playerStr(x: number, y: number, kind: string, label: string) {
  let fill = 'var(--bv-navy)',
    stroke = 'none',
    tcol = '#fff'
  if (kind === 'ol') {
    fill = 'var(--bv-paper)'
    stroke = 'var(--bv-navy)'
    tcol = 'var(--bv-navy)'
  }
  if (kind === 'qb') {
    fill = 'var(--bv-gold)'
    stroke = 'var(--bv-gold-deep)'
    tcol = '#141922'
  }
  return (
    `<circle cx="${x}" cy="${y}" r="6.6" fill="${fill}" stroke="${stroke}" stroke-width="${stroke === 'none' ? 0 : 1.6}"/>` +
    `<text x="${x}" y="${y + 2.6}" text-anchor="middle" font-size="6.6" font-weight="700" fill="${tcol}">${label}</text>`
  )
}

function renderPlaySVG(p: Play) {
  const F = FORMS[p.form]
  let inner = markersDefs() + fieldLines()
  // defense (under routes so the ball paths read on top)
  for (const d of buildDefense(p.form, p.read)) inner += defenderStr(d.x, d.y, d.label, d.hl)
  for (const pt of p.paths || []) {
    const start = pt.who ? F[pt.who] || OL[pt.who] : pt.pts[0]
    const full = pt.who ? [start, ...pt.pts] : pt.pts
    inner += pathStr(full, pt.type)
  }
  for (const k in OL) inner += playerStr(OL[k][0], OL[k][1], 'ol', '')
  for (const k in F) inner += playerStr(F[k][0], F[k][1], k === 'QB' ? 'qb' : 'skill', LABEL[k])
  return `<svg viewBox="0 0 ${W} ${H}" class="bv-field" role="img" aria-label="${p.name} diagram">${inner}</svg>`
}

const KIND_LABEL: Record<string, string> = {
  'k-run': 'Run',
  'k-pass': 'Quick',
  'k-rpo': 'RPO',
  'k-shot': 'Shot',
  'k-heavy': 'Heavy',
  'k-gadget': 'Gadget',
}

const PLAYS: { g: string; items: Play[] }[] = [
  {
    g: 'Run Game',
    items: [
      { no: 1, name: '22 Trap', kind: 'k-run', form: 'trips', note: '<b>Base run.</b> LG pulls & traps the first man past center; RB aims A-gap and cuts off the kickout.', read: { id: 'DE_R', label: 'TRAP' }, paths: [{ who: 'RB', type: 'run', pts: [[124, 132], [140, 120], [150, 112], [152, 58]] }, { who: 'LG', type: 'pull', pts: [[126, 134], [144, 126], [166, 114]] }, { who: 'QB', type: 'fake', pts: [[116, 150], [104, 148]] }] },
      { no: 2, name: '21 / Read', kind: 'k-run', form: 'trips', note: '<b>Inside-zone read.</b> QB reads the backside DE (red): crashes → keep; sits → give inside.', read: { id: 'DE_R', label: 'READ' }, paths: [{ who: 'RB', type: 'run', pts: [[120, 130], [108, 116], [96, 56]] }, { who: 'QB', type: 'keep', pts: [[150, 142], [178, 118], [190, 66]] }] },
      { no: 3, name: '22 Crunch', kind: 'k-run', form: 'trips', note: '<b>Power.</b> Playside down-blocks, edge kicks out, LG pulls to lead through the hole for the Mike.', read: { id: 'DE_R', label: 'EMOL' }, paths: [{ who: 'RB', type: 'run', pts: [[128, 132], [148, 118], [152, 62]] }, { who: 'LG', type: 'pull', pts: [[130, 134], [150, 122], [150, 104]] }, { who: 'RT', type: 'block', pts: [[172, 114]] }] },
      { no: 4, name: '26 Tornado', kind: 'k-run', form: 'trips', note: '<b>Pin-and-pull perimeter.</b> Jet motion influences; pullers lead the RB to the right edge.', read: { id: 'DE_R', label: 'PIN' }, paths: [{ who: 'r6', type: 'motion', pts: [[150, 148], [122, 150]] }, { who: 'RB', type: 'run', pts: [[140, 136], [182, 120], [216, 92]] }, { who: 'LG', type: 'pull', pts: [[132, 136], [172, 122], [198, 106]] }] },
      { no: 5, name: 'Jet Sweep', kind: 'k-run', form: 'trips', note: '<b>Tempo perimeter.</b> Backside man jets across, takes the mesh and bends off the reach blocks.', paths: [{ who: 'r5', type: 'motion', pts: [[70, 140], [118, 148]] }, { who: 'RB', type: 'run', pts: [[118, 148], [160, 136], [206, 118], [236, 96]] }, { who: 'QB', type: 'fake', pts: [[150, 150], [172, 142]] }] },
      { no: 6, name: 'QB Draw', kind: 'k-run', form: 'trips', note: '<b>Change-up vs the rush.</b> Sell the drop, let the ends up-field, C climbs to the Mike; draw up the gut.', read: { id: 'LB_M', label: 'M' }, paths: [{ who: 'QB', type: 'fake', pts: [[130, 158]] }, { who: 'QB', type: 'run', pts: [[130, 158], [130, 118], [132, 56]] }] },
    ],
  },
  {
    g: 'RPO / Constraints',
    items: [
      { no: 7, name: 'Fake 21 · 18 Bubble', kind: 'k-rpo', form: 'trips', note: '<b>Zone-bubble RPO.</b> Ride the zone fake; overhang sits inside → throw the bubble; overhang widens → give.', read: { id: 'LB_S', label: 'READ' }, paths: [{ who: 'RB', type: 'fake', pts: [[110, 130], [98, 118]] }, { who: 'r4', type: 'route', pts: [[202, 130], [214, 126], [238, 114]] }, { who: 'r6', type: 'route', pts: [[187, 58]] }, { who: 'QB', type: 'throw', pts: [[236, 116]] }] },
      { no: 8, name: 'Flip 28 · 6 RPO', kind: 'k-rpo', form: 'trips', note: '<b>Edge-run RPO (shown unflipped).</b> Run action to the edge; read the flat defender, throw #6 quick if he triggers.', read: { id: 'LB_S', label: 'READ' }, paths: [{ who: 'RB', type: 'run', pts: [[150, 138], [186, 122], [206, 108]] }, { who: 'r6', type: 'route', pts: [[177, 114], [163, 103]] }, { who: 'QB', type: 'throw', pts: [[164, 104]] }] },
    ],
  },
  {
    g: 'Quick Game',
    items: [
      { no: 9, name: '34 Arrow Hitch', kind: 'k-pass', form: 'trips', note: '<b>High-low the flat.</b> #3 arrow to the flat, #4 hitch behind it, #6 clears vertical, #5 backside hot.', paths: [{ who: 'r3', type: 'route', pts: [[251, 112], [236, 118]] }, { who: 'r4', type: 'route', pts: [[213, 104], [213, 108]] }, { who: 'r6', type: 'route', pts: [[187, 56]] }, { who: 'r5', type: 'route', pts: [[17, 102], [17, 106]] }] },
      { no: 10, name: 'Twins Corner Hitch', kind: 'k-pass', form: 'twins', note: '<b>Corner/hitch high-low.</b> Hitch vs off coverage, corner vs press or a squatting flat defender.', paths: [{ who: 'r4', type: 'route', pts: [[243, 94], [258, 72]] }, { who: 'r3', type: 'route', pts: [[208, 102], [208, 106]] }, { who: 'r5', type: 'route', pts: [[19, 102], [19, 106]] }] },
    ],
  },
  {
    g: 'Shots',
    items: [
      { no: 11, name: 'Verticals (4 verts)', kind: 'k-shot', form: 'trips', note: '<b>MOF read.</b> Outside go, slots on the seams. 1-high → hit a seam in the void; 2-high → best outside go.', read: { id: 'S_R', label: 'FS' }, paths: [{ who: 'r3', type: 'route', pts: [[247, 28]] }, { who: 'r4', type: 'route', pts: [[210, 32]] }, { who: 'r6', type: 'route', pts: [[178, 30]] }, { who: 'r5', type: 'route', pts: [[17, 28]] }] },
      { no: 12, name: 'Flip 5 Fade', kind: 'k-shot', form: 'trips', note: '<b>One-shot iso.</b> Press → back-shoulder fade to #5; off coverage → nothing there, check it down to the RB.', read: { id: 'CB_L', label: 'CB' }, paths: [{ who: 'r5', type: 'route', pts: [[13, 32]] }, { who: 'RB', type: 'route', pts: [[96, 138], [78, 132]] }] },
    ],
  },
  {
    g: 'Heavy',
    items: [
      { no: 13, name: 'Beast 26', kind: 'k-heavy', form: 'beast', note: '<b>Short yardage / goal line.</b> Double-team the point defender (two ○ on one ✕), RB one cut downhill.', read: { id: 'DE_R', label: '' }, paths: [{ who: 'RB', type: 'run', pts: [[142, 140], [162, 120], [168, 64]] }, { who: 'RT', type: 'block', pts: [[172, 113]] }, { who: 'r4', type: 'block', pts: [[176, 113]] }] },
    ],
  },
  {
    g: 'Gadget (one per game)',
    items: [
      { no: 14, name: 'Doce Cross Return', kind: 'k-gadget', form: 'doce', note: '<b>Double pass.</b> ① QB flips a clear <u>backward</u> pass to #8, ② #8 resets and throws the deep cross. Plus territory only.', paths: [{ who: 'QB', type: 'throw', pts: [[110, 152]] }, { who: 'r4', type: 'route', pts: [[220, 70], [182, 48]] }, { who: 'r8', type: 'throw', pts: [[178, 50]] }] },
      { no: 15, name: 'Doce Jet Wheel Hitch Post', kind: 'k-gadget', form: 'doce', note: '<b>Shot off jet.</b> Jet holds the flat, #4 wheels up the sideline, #3 hitch underneath, #5 post is the single-high alert.', read: { id: 'S_R', label: 'FS' }, paths: [{ who: 'r6', type: 'motion', pts: [[120, 150], [150, 150]] }, { who: 'r4', type: 'route', pts: [[248, 126], [250, 86], [251, 48]] }, { who: 'r3', type: 'route', pts: [[210, 102], [210, 106]] }, { who: 'r5', type: 'route', pts: [[15, 70], [58, 38]] }] },
    ],
  },
]

const CSS = `
.bv-root{
  --bv-navy:#485995; --bv-navy-deep:#36436f; --bv-gold:#d2c600; --bv-gold-deep:#8f8600;
  --bv-ink:#141922; --bv-muted:#5b6472; --bv-paper:#ffffff; --bv-bg:#eef1f7; --bv-line:#cdd2e0;
  --bv-field:#f4f6fb; --bv-field-line:#d3d9e8; --bv-los:#485995;
  --bv-run:#b58a00; --bv-route:#2b3f74; --bv-motion:#8a93a6; --bv-def:#c0453b; --bv-dline:#737d90;
  --bv-run-tag:#2f8f5b; --bv-pass-tag:#3563b0; --bv-rpo-tag:#8a5cc0; --bv-shot-tag:#c8871a; --bv-heavy-tag:#8a5a2b; --bv-gadget-tag:#c0453b;
  color:var(--bv-ink); background:var(--bv-bg); min-height:100vh;
}
.dark .bv-root{
  --bv-ink:#e9edf6; --bv-muted:#9aa3b7; --bv-paper:#161c2e; --bv-bg:#0b0f1a; --bv-line:#2a3350;
  --bv-field:#10162a; --bv-field-line:#232c48; --bv-los:#8fa3df;
  --bv-run:#e0b23a; --bv-route:#9db4ee; --bv-motion:#6c7590; --bv-def:#e0665c; --bv-dline:#828ca4;
}
.bv-container{max-width:1080px;margin:0 auto;padding:86px 14px 80px;}
.bv-hero{background:linear-gradient(135deg,var(--bv-navy-deep),var(--bv-navy));color:#fff;border-radius:18px;padding:26px 28px;position:relative;overflow:hidden;box-shadow:0 14px 40px rgba(17,24,39,.16);}
.bv-hero::after{content:"";position:absolute;right:-50px;top:-50px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(210,198,0,.26),transparent 68%);}
.bv-eye{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--bv-gold);font-weight:600;}
.bv-hero h1{margin:.25em 0 .12em;font-size:clamp(24px,4vw,36px);letter-spacing:-.02em;line-height:1.04;}
.bv-hero p{margin:0;color:rgba(255,255,255,.86);max-width:64ch;font-size:14px;}
.bv-legend{display:flex;flex-wrap:wrap;gap:12px 20px;background:var(--bv-paper);border:1px solid var(--bv-line);border-radius:12px;padding:13px 16px;margin:16px 0 6px;font-size:12.5px;align-items:center;}
.bv-legend b{color:var(--bv-navy);font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-right:2px;}
.bv-lg{display:inline-flex;align-items:center;gap:7px;color:var(--bv-muted);}
.bv-chipO{width:16px;height:16px;border-radius:50%;background:var(--bv-navy);display:inline-block;}
.bv-chipC{width:16px;height:16px;border-radius:50%;background:var(--bv-paper);border:2px solid var(--bv-navy);display:inline-block;}
.bv-chipQ{width:16px;height:16px;border-radius:50%;background:var(--bv-gold);border:1px solid var(--bv-gold-deep);display:inline-block;}
.bv-group{font-size:15px;margin:26px 4px 2px;padding-bottom:6px;border-bottom:2px solid var(--bv-line);color:var(--bv-ink);}
.bv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-top:14px;}
.bv-card{background:var(--bv-paper);border:1px solid var(--bv-line);border-radius:14px;overflow:hidden;box-shadow:0 10px 28px rgba(17,24,39,.08);display:flex;flex-direction:column;}
.bv-cap{display:flex;align-items:center;gap:9px;padding:11px 13px 9px;}
.bv-idx{width:24px;height:24px;border-radius:7px;background:var(--bv-navy);color:#fff;display:grid;place-items:center;font-size:12.5px;font-weight:700;flex:none;}
.bv-nm{font-weight:700;font-size:14.5px;letter-spacing:-.01em;line-height:1.1;}
.bv-kind{margin-left:auto;font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 7px;border-radius:5px;color:#fff;white-space:nowrap;}
.k-run{background:var(--bv-run-tag);}.k-pass{background:var(--bv-pass-tag);}.k-rpo{background:var(--bv-rpo-tag);}
.k-shot{background:var(--bv-shot-tag);}.k-heavy{background:var(--bv-heavy-tag);}.k-gadget{background:var(--bv-gadget-tag);}
.bv-fieldwrap{padding:0 10px;}
.bv-field{width:100%;height:auto;display:block;background:var(--bv-field);border-radius:9px;border:1px solid var(--bv-field-line);}
.bv-note{padding:9px 13px 13px;font-size:12px;color:var(--bv-muted);line-height:1.4;}
.bv-note b{color:var(--bv-navy);}
@media print{
  @page{margin:9mm;}
  .bv-root{background:#fff;} .bv-hero{box-shadow:none;} .bv-card{box-shadow:none;break-inside:avoid;}
  .bv-grid{grid-template-columns:repeat(2,1fr);} .bv-group{break-after:avoid;}
}
`

function buildBody() {
  const legend = `<div class="bv-legend"><b>Key</b>
    <span class="bv-lg"><span class="bv-chipC"></span>Lineman</span>
    <span class="bv-lg"><span class="bv-chipO"></span>Receiver / Back</span>
    <span class="bv-lg"><span class="bv-chipQ"></span>QB</span>
    <span class="bv-lg"><svg width="34" height="12"><line x1="1" y1="6" x2="26" y2="6" stroke="var(--bv-route)" stroke-width="2.4"/><polygon points="26,2 33,6 26,10" fill="var(--bv-route)"/></svg>Route</span>
    <span class="bv-lg"><svg width="34" height="12"><line x1="1" y1="6" x2="26" y2="6" stroke="var(--bv-run)" stroke-width="3.2"/><polygon points="26,1 33,6 26,11" fill="var(--bv-run)"/></svg>Run / ball</span>
    <span class="bv-lg"><svg width="34" height="12"><line x1="1" y1="6" x2="26" y2="6" stroke="var(--bv-motion)" stroke-width="2" stroke-dasharray="4 3"/><polygon points="26,2 33,6 26,10" fill="var(--bv-motion)"/></svg>Motion</span>
    <span class="bv-lg"><svg width="30" height="12"><line x1="1" y1="6" x2="22" y2="6" stroke="var(--bv-route)" stroke-width="2.4"/><line x1="22" y1="1" x2="22" y2="11" stroke="var(--bv-route)" stroke-width="2.4"/></svg>Block</span>
    <span class="bv-lg"><svg width="16" height="14"><text x="3" y="12" fill="var(--bv-dline)" font-size="13" font-weight="700" font-family="sans-serif">✕</text></svg>Defender</span>
    <span class="bv-lg"><svg width="16" height="14"><text x="3" y="12" fill="var(--bv-def)" font-size="13" font-weight="700" font-family="sans-serif">✕</text></svg>Read / key</span>
  </div>`

  const groups = PLAYS.map((group) => {
    const cards = group.items
      .map(
        (p) =>
          `<div class="bv-card"><div class="bv-cap"><span class="bv-idx">${p.no}</span><span class="bv-nm">${p.name}</span><span class="bv-kind ${p.kind}">${KIND_LABEL[p.kind]}</span></div><div class="bv-fieldwrap">${renderPlaySVG(p)}</div><div class="bv-note">${p.note}</div></div>`,
      )
      .join('')
    return `<h2 class="bv-group">${group.g}</h2><div class="bv-grid">${cards}</div>`
  }).join('')

  return legend + groups
}

export default function BulldogsVarsityPage() {
  return (
    <div className="bv-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Navbar />
      <div className="bv-container">
        <header className="bv-hero">
          <div className="bv-eye">Tinley Bulldogs 13U · PlayScout · PlaybookIQ</div>
          <h1>Bulldogs Varsity — Visual Play Diagrams</h1>
          <p>
            The optimized 15-play core, drawn up against a base 4-3 defense. ○ = your players, ✕ = defense. Solid arrows
            are pass routes, the thick gold arrow is the ball carrier, dashed = motion, and the red defender is your read
            / point of attack.
          </p>
        </header>
        <div dangerouslySetInnerHTML={{ __html: buildBody() }} />
        <p style={{ marginTop: 34, textAlign: 'center', color: 'var(--bv-muted)', fontSize: 12 }}>
          Formations &amp; routes are a recommended install derived from your v1.0 calls — the defense shown is a base
          4-3 look for reference. Confirm spacing &amp; terminology with your staff.
        </p>
      </div>
    </div>
  )
}
