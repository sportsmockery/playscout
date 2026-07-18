'use client'

import { Navbar } from '@/components/layout/navbar'
import content from './content.json'

/* Complete 2025 Varsity playbook (faithful reproduction from the PPTX geometry)
 * with the PlaybookIQ intelligence layer — grade, recommended core, install plan,
 * per-play notes, and a "core only" filter — layered on top. Nothing removed.
 * Body + CSS are prebuilt (see scripts) so the page is fully static. */

export default function BulldogsVarsityPage() {
  return (
    <div className="bv-root">
      <style dangerouslySetInnerHTML={{ __html: content.css }} />
      <Navbar />
      <div className="bv-container" dangerouslySetInnerHTML={{ __html: content.body }} />
    </div>
  )
}
