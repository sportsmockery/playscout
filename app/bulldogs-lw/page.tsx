'use client'

import { Navbar } from '@/components/layout/navbar'
import content from './content.json'

/* Complete 2026 LW Double Wing playbook (faithful reproduction from the PDF
 * vector geometry, with a 4-4 reference defense) plus the PlaybookIQ intelligence
 * layer — grade, recommended core, install plan, per-play notes, and a "core only"
 * filter — layered on top. Nothing removed. Body + CSS are prebuilt (static). */

export default function BulldogsLwPage() {
  return (
    <div className="bv-root">
      <style dangerouslySetInnerHTML={{ __html: content.css }} />
      <Navbar />
      <div className="bv-container" dangerouslySetInnerHTML={{ __html: content.body }} />
    </div>
  )
}
