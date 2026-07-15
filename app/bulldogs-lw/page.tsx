'use client'

import { Navbar } from '@/components/layout/navbar'

/* ------------------------------------------------------------------ *
 * Bulldogs LW (10U) — Double Wing Visual Play Diagrams
 * Optimized core recreated from TPBD_LW_Offense_2026, drawn against a
 * base 4-4 defense. Static SVG, server-rendered, no client JS required.
 * ------------------------------------------------------------------ */

const W = 260,
  H = 178,
  LOS = 118

// Double Wing base: 7-man tight line (o*) + QB under center, FB, two wings.
const DW: Record<string, [number, number]> = {
  oLE: [97, 124], oLT: [108, 124], oLG: [119, 124], oC: [130, 124], oRG: [141, 124], oRT: [152, 124], oRE: [163, 124],
  QB: [130, 133], FB: [130, 147], LW: [86, 132], RW: [174, 132],
}
const FORMS_LW: Record<string, Record<string, [number, number]>> = { dw: DW }
const LABEL_LW: Record<string, string> = { QB: 'QB', FB: '2', LW: '3', RW: '4' }

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
  read?: { id: string; label: string }
  paths?: PlayPath[]
}

const poly = (pts: Pt[]) => pts.map((p) => p.join(',')).join(' ')

/** Base 4-4 defense (8 in the box) — the standard answer to a tight Double Wing. */
function build44Defense(read?: { id: string; label: string }) {
  const base: [string, number, number][] = [
    ['DE_L', 100, 110], ['DT_L', 120, 110], ['DT_R', 140, 110], ['DE_R', 160, 110],
    ['OLB_L', 86, 101], ['ILB_L', 119, 100], ['ILB_R', 141, 100], ['OLB_R', 174, 101],
    ['CB_L', 44, 104], ['CB_R', 216, 104], ['FS', 130, 62],
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
    keep: { stroke: 'var(--bv-run)', w: 3, dash: null, mk: 'aRun' },
    motion: { stroke: 'var(--bv-motion)', w: 1.9, dash: '4 3', mk: 'aMot' },
    pull: { stroke: 'var(--bv-route)', w: 2.2, dash: null, mk: 'aRoute' },
    throw: { stroke: 'var(--bv-route)', w: 1.6, dash: '4 3', mk: 'aRoute' },
    fake: { stroke: 'var(--bv-motion)', w: 2, dash: '3 3', mk: 'aMot' },
    block: { stroke: 'var(--bv-route)', w: 2.2, dash: null, mk: null },
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
  const F = FORMS_LW[p.form]
  let inner = markersDefs() + fieldLines()
  for (const d of build44Defense(p.read)) inner += defenderStr(d.x, d.y, d.label, d.hl)
  for (const pt of p.paths || []) {
    const start = pt.who ? F[pt.who] : pt.pts[0]
    const full = pt.who ? [start, ...pt.pts] : pt.pts
    inner += pathStr(full, pt.type)
  }
  for (const k in F) {
    const [x, y] = F[k]
    if (k[0] === 'o') inner += playerStr(x, y, 'ol', '')
    else inner += playerStr(x, y, k === 'QB' ? 'qb' : 'skill', LABEL_LW[k] || '')
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="bv-field" role="img" aria-label="${p.name} diagram">${inner}</svg>`
}

const KIND_LABEL: Record<string, string> = {
  'k-dive': 'Dive', 'k-keep': 'Keeper', 'k-power': 'Power', 'k-sweep': 'Perimeter', 'k-short': 'Short yd', 'k-gl': 'Goal line',
}
const KIND_CLASS: Record<string, string> = {
  'k-dive': 'k-run', 'k-keep': 'k-rpo', 'k-power': 'k-heavy', 'k-sweep': 'k-pass', 'k-short': 'k-shot', 'k-gl': 'k-gadget',
}

const PLAYS: { g: string; items: Play[] }[] = [
  {
    g: 'Dive Series — the base',
    items: [
      { no: 1, name: '22 Dive', kind: 'k-dive', form: 'dw', note: '<b>Base dive.</b> FB downhill to the right A-gap behind down blocks. Your bell-cow — rep it until it’s automatic.', read: { id: 'DT_R', label: 'PoA' }, paths: [{ who: 'FB', type: 'run', pts: [[133, 128], [135, 66]] }] },
      { no: 2, name: '21 Dive', kind: 'k-dive', form: 'dw', note: '<b>Base dive, mirror.</b> FB downhill to the left A-gap. Same rules, flipped.', read: { id: 'DT_L', label: 'PoA' }, paths: [{ who: 'FB', type: 'run', pts: [[127, 128], [125, 66]] }] },
      { no: 3, name: '24 Blast', kind: 'k-power', form: 'dw', note: '<b>Off-tackle power.</b> FB hits the right B-gap behind a double-team; right wing kicks out the end.', read: { id: 'DE_R', label: 'PoA' }, paths: [{ who: 'FB', type: 'run', pts: [[142, 130], [151, 70]] }, { who: 'RW', type: 'block', pts: [[164, 120]] }] },
      { no: 4, name: '25 Blast', kind: 'k-power', form: 'dw', note: '<b>Off-tackle power, mirror.</b> FB to the left B-gap; left wing kicks out.', read: { id: 'DE_L', label: 'PoA' }, paths: [{ who: 'FB', type: 'run', pts: [[118, 130], [109, 70]] }, { who: 'LW', type: 'block', pts: [[96, 120]] }] },
    ],
  },
  {
    g: 'Keeper Series — the deception (money plays)',
    items: [
      { no: 5, name: 'Fake 21 · 18 Keeper', kind: 'k-keep', form: 'dw', note: '<b>Bootleg off the dive.</b> Fake the dive left, QB keeps around the right edge. Beats the defender who chases the FB.', read: { id: 'OLB_R', label: 'CONTAIN' }, paths: [{ who: 'FB', type: 'fake', pts: [[123, 132], [117, 124]] }, { who: 'QB', type: 'keep', pts: [[150, 138], [176, 128], [198, 84]] }, { who: 'RW', type: 'block', pts: [[188, 122]] }] },
      { no: 6, name: 'Fake 22 · 17 Keeper', kind: 'k-keep', form: 'dw', note: '<b>Bootleg, mirror.</b> Fake dive right, QB keeps around the left edge.', read: { id: 'OLB_L', label: 'CONTAIN' }, paths: [{ who: 'FB', type: 'fake', pts: [[137, 132], [143, 124]] }, { who: 'QB', type: 'keep', pts: [[110, 138], [84, 128], [62, 84]] }, { who: 'LW', type: 'block', pts: [[72, 122]] }] },
    ],
  },
  {
    g: 'Perimeter — toss, motion & sweep',
    items: [
      { no: 7, name: '28 Toss', kind: 'k-sweep', form: 'dw', note: '<b>Quick pitch right.</b> QB tosses to the right wing; a guard pulls to lead around the edge.', read: { id: 'OLB_R', label: 'FORCE' }, paths: [{ who: 'QB', type: 'throw', pts: [[166, 132]] }, { who: 'RW', type: 'run', pts: [[196, 122], [226, 92]] }, { who: 'oRG', type: 'pull', pts: [[176, 126], [208, 112]] }] },
      { no: 8, name: '27 Toss', kind: 'k-sweep', form: 'dw', note: '<b>Quick pitch left, mirror.</b> Toss to the left wing behind a pulling guard.', read: { id: 'OLB_L', label: 'FORCE' }, paths: [{ who: 'QB', type: 'throw', pts: [[94, 132]] }, { who: 'LW', type: 'run', pts: [[64, 122], [34, 92]] }, { who: 'oLG', type: 'pull', pts: [[84, 126], [52, 112]] }] },
      { no: 9, name: '3MO · 28 Toss', kind: 'k-sweep', form: 'dw', note: '<b>Motion series.</b> Left wing motions across as a lead blocker, then toss right — same play, new picture for the defense.', read: { id: 'OLB_R', label: 'FORCE' }, paths: [{ who: 'LW', type: 'motion', pts: [[130, 150], [176, 140]] }, { who: 'QB', type: 'throw', pts: [[166, 132]] }, { who: 'RW', type: 'run', pts: [[196, 122], [226, 92]] }] },
      { no: 10, name: '47 Sweep', kind: 'k-sweep', form: 'dw', note: '<b>Counter sweep.</b> Right wing carries back across to the left edge behind both pulling guards — misdirection off the toss look.', read: { id: 'OLB_L', label: 'FORCE' }, paths: [{ who: 'RW', type: 'run', pts: [[150, 140], [100, 128], [68, 98]] }, { who: 'oLG', type: 'pull', pts: [[128, 132], [88, 122]] }, { who: 'oRG', type: 'pull', pts: [[150, 130], [104, 116]] }] },
    ],
  },
  {
    g: 'Short yardage & goal line',
    items: [
      { no: 11, name: '10 Sneak', kind: 'k-short', form: 'dw', note: '<b>QB sneak.</b> Behind the wedge/center push — your surest 3rd-and-1.', read: { id: 'DT_R', label: 'PoA' }, paths: [{ who: 'QB', type: 'run', pts: [[130, 122], [131, 100]] }] },
      { no: 12, name: 'Goal-line 25 Lead', kind: 'k-gl', form: 'dw', note: '<b>Lead iso (install from your Heavy/Goal-line set).</b> Left wing leads through the left C-gap, FB follows downhill.', read: { id: 'DE_L', label: 'PoA' }, paths: [{ who: 'LW', type: 'block', pts: [[110, 126], [116, 114]] }, { who: 'FB', type: 'run', pts: [[116, 130], [108, 74]] }] },
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
.bv-hero p{margin:0;color:rgba(255,255,255,.86);max-width:66ch;font-size:14px;}
.bv-grade{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;position:relative;}
.bv-gpill{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:8px 13px;font-size:13px;color:#fff;}
.bv-gpill b{color:var(--bv-gold);font-variant-numeric:tabular-nums;}
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
    <span class="bv-lg"><span class="bv-chipO"></span>Back / Wing</span>
    <span class="bv-lg"><span class="bv-chipQ"></span>QB</span>
    <span class="bv-lg"><svg width="34" height="12"><line x1="1" y1="6" x2="26" y2="6" stroke="var(--bv-run)" stroke-width="3.2"/><polygon points="26,1 33,6 26,11" fill="var(--bv-run)"/></svg>Run / ball</span>
    <span class="bv-lg"><svg width="30" height="12"><line x1="1" y1="6" x2="22" y2="6" stroke="var(--bv-route)" stroke-width="2.2"/><line x1="22" y1="1" x2="22" y2="11" stroke="var(--bv-route)" stroke-width="2.2"/></svg>Block</span>
    <span class="bv-lg"><svg width="34" height="12"><line x1="1" y1="6" x2="24" y2="6" stroke="var(--bv-route)" stroke-width="2.2"/><polygon points="24,2 31,6 24,10" fill="var(--bv-route)"/></svg>Pull</span>
    <span class="bv-lg"><svg width="34" height="12"><line x1="1" y1="6" x2="26" y2="6" stroke="var(--bv-motion)" stroke-width="2" stroke-dasharray="4 3"/><polygon points="26,2 33,6 26,10" fill="var(--bv-motion)"/></svg>Motion / fake</span>
    <span class="bv-lg"><svg width="16" height="14"><text x="3" y="12" fill="var(--bv-dline)" font-size="13" font-weight="700" font-family="sans-serif">✕</text></svg>Defender (4-4)</span>
    <span class="bv-lg"><svg width="16" height="14"><text x="3" y="12" fill="var(--bv-def)" font-size="13" font-weight="700" font-family="sans-serif">✕</text></svg>Point of attack</span>
  </div>`

  const groups = PLAYS.map((group) => {
    const cards = group.items
      .map(
        (p) =>
          `<div class="bv-card"><div class="bv-cap"><span class="bv-idx">${p.no}</span><span class="bv-nm">${p.name}</span><span class="bv-kind ${KIND_CLASS[p.kind]}">${KIND_LABEL[p.kind]}</span></div><div class="bv-fieldwrap">${renderPlaySVG(p)}</div><div class="bv-note">${p.note}</div></div>`,
      )
      .join('')
    return `<h2 class="bv-group">${group.g}</h2><div class="bv-grid">${cards}</div>`
  }).join('')

  return legend + groups
}

export default function BulldogsLwPage() {
  return (
    <div className="bv-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Navbar />
      <div className="bv-container">
        <header className="bv-hero">
          <div className="bv-eye">Tinley Bulldogs LW · 10U · PlayScout · PlaybookIQ</div>
          <h1>Lightweight Double Wing — Optimized Core</h1>
          <p>
            Your 2026 LW offense, graded and trimmed for 10U. The Double Wing identity is a great youth choice — this
            keeps it and cuts 15 formations &amp; ~26 plays down to a rep-able <b>12-play core</b> from one base look,
            drawn against a base <b>4-4</b> defense. ○ = your players, ✕ = defense; the thick gold arrow is the ball
            carrier, and the red defender is the point of attack.
          </p>
          <div className="bv-grade">
            <span className="bv-gpill">Overall <b>76</b>/100</span>
            <span className="bv-gpill">Complexity <b>68</b>/100 · too many formations</span>
            <span className="bv-gpill">Safety <b>✓</b> age-appropriate</span>
            <span className="bv-gpill">Core <b>12</b> plays (from ~26)</span>
          </div>
        </header>
        <div dangerouslySetInnerHTML={{ __html: buildBody() }} />
        <p style={{ marginTop: 34, textAlign: 'center', color: 'var(--bv-muted)', fontSize: 12 }}>
          Recreated &amp; optimized from TPBD_LW_Offense_2026. Blocking assignments are a recommended install; the
          defense shown is a base 4-4 look for reference. Confirm terminology with your staff before installing.
        </p>
      </div>
    </div>
  )
}
