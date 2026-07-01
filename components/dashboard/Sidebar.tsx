'use client';

import Link from 'next/link';
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

const TOP_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Teams', href: '/teams', icon: Users },
  { label: 'Film Library', href: '/film', icon: Film },
  { label: 'Intelligence', href: '/intelligence', icon: Brain },
];

const MODULE_ITEMS: NavItem[] = [
  { label: 'QBIQ', href: '/intelligence/qbiq', icon: Zap },
  { label: 'OLIQ', href: '/intelligence/oliq', icon: Shield },
  { label: 'TeamIQ', href: '/intelligence/teamiq', icon: TrendingUp },
  { label: 'MistakeIQ', href: '/intelligence/mistakeiq', icon: AlertTriangle },
];

interface SidebarProps {
  teamId?: string;
}

export default function Sidebar({ teamId }: SidebarProps) {
  const pathname = usePathname();

  const teamModuleItems: NavItem[] = teamId
    ? MODULE_ITEMS.map((item) => ({
        ...item,
        href: `/teams/${teamId}${item.href.replace('/intelligence', '/modules')}`,
      }))
    : MODULE_ITEMS;

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
        <div className="w-8 h-8 rounded-lg bg-[var(--brand-gold)] flex items-center justify-center flex-shrink-0">
          <span className="text-[var(--brand-navy)] font-bold text-sm">PS</span>
        </div>
        <span className="text-white font-bold text-lg tracking-tight">
          PlayScout
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {TOP_ITEMS.map((item) => (
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
