'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { X } from 'lucide-react';
import PlayScoutIQ from './PlayScoutIQ';

/**
 * Floating PlayScoutIQ launcher, pinned bottom-left on every /app page.
 * The launcher and the chat's branded surfaces use the sidebar background
 * (navy) so the light PlayScout logo reads against them instead of washing
 * out on a light surface.
 */
export default function PlayScoutIQBubble({ defaultTeamId }: { defaultTeamId?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Use the team in the current URL for context; fall back to the user's
  // most recent team so the assistant still has grounding off a team page.
  const rawPathTeam = pathname.match(/^\/teams\/([^/]+)/)?.[1];
  const pathTeamId = rawPathTeam && rawPathTeam !== 'new' ? rawPathTeam : undefined;
  const teamId = pathTeamId ?? defaultTeamId;

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 left-4 sm:left-6 z-[60] w-[calc(100vw-2rem)] sm:w-[380px] h-[70vh] max-h-[600px] animate-in fade-in slide-in-from-bottom-2 duration-150">
          <PlayScoutIQ teamId={teamId} title="Play Scout" />
        </div>
      )}

      {/* Launcher bubble */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Play Scout' : 'Open Play Scout'}
        aria-expanded={open}
        className="fixed bottom-6 left-6 z-[60] w-14 h-14 rounded-full shadow-[0_8px_30px_rgba(17,24,39,0.25)] flex items-center justify-center transition-transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/40"
        style={{ background: 'var(--sidebar-bg)' }}
      >
        {open ? (
          <X size={22} className="text-white" />
        ) : (
          <Image src="/logo.svg" alt="PlayScoutIQ" width={26} height={28} priority />
        )}
      </button>
    </>
  );
}
