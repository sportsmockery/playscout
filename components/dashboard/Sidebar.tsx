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
  ChevronRight,
  Shield,
  Zap,
  TrendingUp,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const MODULE_ITEMS: NavItem[] = [
  { label: 'QBIQ', href: 'qbiq', icon: Zap },
  { label: 'OLIQ', href: 'oliq', icon: Shield },
  { label: 'TeamIQ', href: 'teamiq', icon: TrendingUp },
  { label: 'MistakeIQ', href: 'mistakeiq', icon: AlertTriangle },
  { label: 'PlaybookIQ', href: 'playbookiq', icon: BookOpen },
];

interface SidebarProps {
  teamId?: string;
  defaultTeamId?: string;
}

export default function Sidebar({ teamId: teamIdProp, defaultTeamId }: SidebarProps) {
  const pathname = usePathname();

  // Film Library and the module pages only exist scoped to a team
  // (/teams/[teamId]/film, /teams/[teamId]/modules/qbiq, ...) — there's no
  // team-agnostic route for either. Prefer the team in the current URL;
  // outside a team-scoped page (dashboard, /teams list), fall back to the
  // user's most recently created team so nav is one click, not a detour
  // through the team picker every time.
  const pathTeamId = pathname.match(/^\/teams\/([^/]+)/)?.[1];
  const teamId = teamIdProp ?? pathTeamId ?? defaultTeamId;

  const topItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Teams', href: '/teams', icon: Users },
    { label: 'Film Library', href: teamId ? `/teams/${teamId}/film` : '/teams', icon: Film },
    { label: 'Intelligence', href: '/intelligence', icon: Brain },
  ];

  const teamModuleItems: NavItem[] = MODULE_ITEMS.map((item) => ({
    ...item,
    href: teamId ? `/teams/${teamId}/modules/${item.href}` : '/teams',
  }));

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

        {/* Modules group */}
        <div className="pt-4 pb-1 px-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
            Modules
          </p>
        </div>

        {teamModuleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'sidebar-nav-item pl-4',
              isActive(item.href) && 'active'
            )}
          >
            <item.icon size={16} className="flex-shrink-0 sidebar-icon" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom — settings */}
      <div className="px-3 py-4 border-t border-white/10">
        <Link
          href="/settings"
          className={cn(
            'sidebar-nav-item',
            isActive('/settings') && 'active'
          )}
        >
          <Settings size={18} className="flex-shrink-0" />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
