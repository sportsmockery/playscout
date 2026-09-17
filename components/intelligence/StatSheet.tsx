'use client';

import { useState } from 'react';
import BoxScore from './BoxScore';
import StatCorrections from './StatCorrections';
import type { StatLine, TeamStatTotals } from '@/lib/intelligence/stat-lines';

/**
 * The box score plus its correction path, for surfaces that render a SAVED
 * report rather than a live run.
 *
 * It exists because a correction has to change what is on screen immediately —
 * a coach who fixes a carry and still sees the old total has no way to know it
 * worked — and the saved-report page is a server component. The re-totalled
 * sheet comes back from the PATCH, computed by the same code that charted it,
 * so nothing is recalculated in the browser.
 */
export default function StatSheet({
  analysisId,
  lines: initialLines,
  team: initialTeam,
  warnings: initialWarnings = [],
}: {
  analysisId: string;
  lines: StatLine[];
  team: TeamStatTotals;
  warnings?: string[];
}) {
  const [sheet, setSheet] = useState({
    lines: initialLines,
    team: initialTeam,
    warnings: initialWarnings,
  });

  return (
    <div className="space-y-4">
      <BoxScore lines={sheet.lines} team={sheet.team} warnings={sheet.warnings} />
      <StatCorrections analysisId={analysisId} onCorrected={setSheet} />
    </div>
  );
}
