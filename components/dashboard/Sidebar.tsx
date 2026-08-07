'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Film,
  Brain,
  Settings,
  Shield,
  ShieldCheck,
  Zap,
  Gauge,
  TrendingUp,
  AlertTriangle,
  BookOpen,
  Crosshair,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

const MODULE_ITEMS: NavItem[] = [
  { label: 'QBIQ', href: 'qbiq', icon: Zap },
  { label: 'RBIQ', href: 'rbiq', icon: Gauge },
  { label: 'OLIQ', href: 'oliq', icon: Shield },
  { label: 'TeamIQ', href: 'teamiq', icon: TrendingUp },
  { label: 'MistakeIQ', href: 'mistakeiq', icon: AlertTriangle },
  { label: 'ScoutIQ', href: 'scoutiq', icon: Crosshair },
  { label: 'PlaybookIQ', href: 'playbookiq', icon: BookOpen },
];

interface SidebarProps {
  teamId?: string;
  defaultTeamId?: string;
  isAdmin?: boolean;
}

export default function Sidebar({ teamId: teamIdProp, isAdmin }: SidebarProps) {
  const pathname = usePathname();

  // Film Library, the team Intelligence hub, and the IQ modules only exist
  // scoped to a team. They are site-wide features but always operate ON a
  // specific team, so they appear as nav options only once the coach is
  // actually inside a team workspace (a /teams/[id]/... route) — not on the
  // dashboard or the teams list, where a module link would have no team to
  // act on. `defaultTeamId` is kept only as a last-resort fallback when a
  // team layout explicitly hands us one.
  const rawPathTeam = pathname.match(/^\/teams\/([^/]+)/)?.[1];
  // "/teams/new" is the create-team form, not a team workspace.
  const pathTeamId = rawPathTeam && rawPathTeam !== 'new' ? rawPathTeam : undefined;
  const activeTeamId = teamIdProp ?? pathTeamId ?? undefined;

  // PlayScoutIQ now lives in the floating chat bubble (bottom-left, mounted in
  // AppShell), so it no longer needs a sidebar entry.
  const topItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Teams', href: '/teams', icon: Users },
  ];

  const teamItems: NavItem[] = activeTeamId
    ? [
        { label: 'Film Library', href: `/teams/${activeTeamId}/film`, icon: Film },
        { label: 'Intelligence', href: `/teams/${activeTeamId}/intelligence`, icon: Brain },
      ]
    : [];

  const teamModuleItems: NavItem[] = activeTeamId
    ? MODULE_ITEMS.map((item) => ({
        ...item,
        href: `/teams/${activeTeamId}/modules/${item.href}`,
      }))
    : [];

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col h-full"
      style={{
        width: 'var(--sidebar-width)',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-white/95 flex items-center justify-center flex-shrink-0 p-1">
          <Image src="/logo.svg" alt="" width={22} height={24} />
        </div>
        <span className="text-white font-bold text-lg tracking-tight">
          PlayScout
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {topItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn('sidebar-nav-item', isActive(item.href) && 'active')}
          >
            <item.icon size={18} className="flex-shrink-0 sidebar-icon" />
            <span>{item.label}</span>
            {item.badge && (
              <span className="ml-auto text-xs bg-[var(--brand-gold)] text-[var(--brand-navy)] px-1.5 py-0.5 rounded-full font-semibold">
                {item.badge}
              </span>
            )}
          </Link>
        ))}

        {/* Team workspace — only once a team is selected. IQ modules operate
            on a specific team, so they surface here, not in the global nav. */}
        {activeTeamId ? (
          <>
            <div className="pt-4 pb-1 px-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
                Team
              </p>
            </div>

            {teamItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn('sidebar-nav-item', isActive(item.href) && 'active')}
              >
                <item.icon size={18} className="flex-shrink-0 sidebar-icon" />
                <span>{item.label}</span>
              </Link>
            ))}

            <div className="pt-4 pb-1 px-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
                IQ Modules
              </p>
            </div>

            {teamModuleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn('sidebar-nav-item pl-4', isActive(item.href) && 'active')}
              >
                <item.icon size={16} className="flex-shrink-0 sidebar-icon" />
                <span>{item.label}</span>
              </Link>
            ))}
          </>
        ) : (
          <div className="pt-4 px-3">
            <p className="text-xs text-white/40 leading-relaxed">
              Select a team to open its film library and IQ modules.
            </p>
          </div>
        )}
      </nav>

      {/* Bottom — admin (owners/admins only) + settings */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        {isAdmin && (
          <Link
            href="/admin"
            className={cn('sidebar-nav-item', isActive('/admin') && 'active')}
          >
            <ShieldCheck size={18} className="flex-shrink-0" />
            <span>Users &amp; Roles</span>
          </Link>
        )}
        <Link
          href={activeTeamId ? `/teams/${activeTeamId}/settings` : '/settings'}
          className={cn(
            'sidebar-nav-item',
            pathname.endsWith('/settings') && 'active'
          )}
        >
          <Settings size={18} className="flex-shrink-0" />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
