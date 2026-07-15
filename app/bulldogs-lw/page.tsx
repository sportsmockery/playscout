'use client'

import { Navbar } from '@/components/layout/navbar'
import plays from './plays.json'

/* ------------------------------------------------------------------ *
 * Bulldogs LW (10U) — COMPLETE Double Wing playbook, reproduced
 * faithfully from the original PDF's vector geometry (real alignments
 * and route/blocking arrows), with a reference 4-4 defense overlaid.
 * Every formation & play, nothing removed. SVG prebuilt & static.
 * ------------------------------------------------------------------ */

type Item = { p: number; title: string; svg: string }
type Group = { group: string; items: Item[] }
const DATA = plays as Group[]
const TOTAL = DATA.reduce((s, g) => s + g.items.length, 0)

const CSS = `
.bv-root{
  --bv-navy:#485995; --bv-navy-deep:#36436f; --bv-gold:#d2c600;
  --bv-ink:#141922; --bv-muted:#5b6472; --bv-paper:#ffffff; --bv-bg:#eef1f7; --bv-line:#cdd2e0;
  --field:#f4f6fb; --field-line:#d3d9e8; --route:#b58a00; --navy:#485995; --dline:#737d90; --paper:#ffffff; --muted:#5b6472;
  color:var(--bv-ink); background:var(--bv-bg); min-height:100vh;
}
.dark .bv-root{
  --bv-ink:#e9edf6; --bv-muted:#9aa3b7; --bv-paper:#161c2e; --bv-bg:#0b0f1a; --bv-line:#2a3350;
  --field:#10162a; --field-line:#232c48; --route:#e0b23a; --navy:#8fa3df; --dline:#828ca4; --paper:#161c2e; --muted:#9aa3b7;
}
.bv-container{max-width:1120px;margin:0 auto;padding:86px 14px 80px;}
.bv-hero{background:linear-gradient(135deg,var(--bv-navy-deep),var(--bv-navy));color:#fff;border-radius:18px;padding:26px 28px;position:relative;overflow:hidden;box-shadow:0 14px 40px rgba(17,24,39,.16);}
.bv-hero::after{content:"";position:absolute;right:-50px;top:-50px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(210,198,0,.26),transparent 68%);}
.bv-eye{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--bv-gold);font-weight:600;}
.bv-hero h1{margin:.25em 0 .12em;font-size:clamp(24px,4vw,34px);letter-spacing:-.02em;line-height:1.04;}
.bv-hero p{margin:0;color:rgba(255,255,255,.86);max-width:70ch;font-size:14px;}
.bv-legend{display:flex;flex-wrap:wrap;gap:12px 18px;background:var(--bv-paper);border:1px solid var(--bv-line);border-radius:12px;padding:12px 16px;margin:16px 0 4px;font-size:12.5px;align-items:center;}
.bv-legend b{color:var(--bv-navy);font-size:11px;letter-spacing:.06em;text-transform:uppercase;}
.bv-lg{display:inline-flex;align-items:center;gap:7px;color:var(--bv-muted);}
.bv-dotN{width:15px;height:15px;border-radius:50%;background:var(--bv-navy);display:inline-block;}
.bv-dotO{width:15px;height:15px;border-radius:50%;background:var(--bv-paper);border:2px solid var(--bv-navy);display:inline-block;}
.bv-group{font-size:16px;margin:26px 4px 4px;padding-bottom:6px;border-bottom:2px solid var(--bv-line);color:var(--bv-ink);}
.bv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;margin-top:12px;}
.bv-card{background:var(--bv-paper);border:1px solid var(--bv-line);border-radius:14px;overflow:hidden;box-shadow:0 10px 28px rgba(17,24,39,.08);}
.bv-cap{padding:11px 14px 6px;font-weight:700;font-size:14.5px;color:var(--bv-navy);}
.field{width:100%;height:auto;display:block;background:var(--field);border-top:1px solid var(--field-line);}
@media print{
  @page{margin:8mm;}
  .bv-root{background:#fff;} .bv-hero{box-shadow:none;} .bv-card{box-shadow:none;break-inside:avoid;}
  .bv-grid{grid-template-columns:repeat(2,1fr);}
}
`

function body() {
  const legend = `<div class="bv-legend"><b>Key</b>
    <span class="bv-lg"><span class="bv-dotN"></span>Back (numbered)</span>
    <span class="bv-lg"><span class="bv-dotO"></span>Lineman (E/T/G/C)</span>
    <span class="bv-lg"><svg width="30" height="12"><line x1="1" y1="6" x2="26" y2="6" stroke="var(--route)" stroke-width="3"/></svg>Route / block (from your file)</span>
    <span class="bv-lg"><svg width="16" height="14"><text x="3" y="12" fill="var(--dline)" font-size="13" font-weight="700" font-family="sans-serif">&#10005;</text></svg>Defense (4-4 reference)</span>
  </div>`
  const groups = DATA.map((g) => {
    const cards = g.items.map((it) => `<div class="bv-card"><div class="bv-cap">${it.title}</div>${it.svg}</div>`).join('')
    return `<h2 class="bv-group">${g.group}</h2><div class="bv-grid">${cards}</div>`
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
          <h1>Complete Playbook — {TOTAL} pages</h1>
          <p>
            Every formation and play from your 2026 LW Double Wing book, reproduced from the original PDF&apos;s actual
            vector geometry — real alignments and your real route &amp; blocking arrows — with a reference{' '}
            <b>4-4 defense</b> overlaid. Nothing removed.
          </p>
        </header>
        <div dangerouslySetInnerHTML={{ __html: body() }} />
        <p style={{ marginTop: 34, textAlign: 'center', color: 'var(--bv-muted)', fontSize: 12 }}>
          Faithfully reproduced from TPBD_LW_Offense_2026.pdf by PlayScout · PlaybookIQ. Alignments and route/blocking
          arrows are read from the original file; the 4-4 defense is a reference overlay (your book shows offense only).
        </p>
      </div>
    </div>
  )
}
