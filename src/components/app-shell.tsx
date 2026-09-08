'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  Bell,
  Building2,
  ClipboardCheck,
  FileBarChart,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Repeat,
  Search,
  ScrollText,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import type { SessionUser } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { SECTION_LABELS, type NavItem } from '@/lib/nav';
import { initials } from '@/lib/format';
import { OfflineIndicator } from '@/components/offline-indicator';

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ClipboardCheck,
  TriangleAlert,
  ShieldCheck,
  Building2,
  FileBarChart,
  Repeat,
  ListChecks,
  Users,
  Settings,
  ScrollText,
};

export function AppShell({
  user,
  nav,
  unreadCount,
  children,
}: {
  user: SessionUser;
  nav: NavItem[];
  unreadCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer on navigation — otherwise it covers the page you just opened.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sections = (['work', 'manage', 'admin'] as const)
    .map((section) => ({ section, items: nav.filter((n) => n.section === section) }))
    .filter((s) => s.items.length > 0);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-accent text-2xs font-bold text-white">
          BC
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight">BranchCheck</div>
          <div className="truncate text-2xs text-muted">{user.organizationName}</div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="btn-ghost ml-auto p-1.5 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map(({ section, items }) => (
          <div key={section}>
            <p className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
              {SECTION_LABELS[section]}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = ICONS[item.icon] ?? LayoutDashboard;
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={clsx(
                        'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
                        active
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'text-muted hover:bg-raised hover:text-ink',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink">{user.name}</div>
            <div className="truncate text-2xs text-muted">{ROLE_LABELS[user.role]}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="btn-ghost p-1.5"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:sticky lg:top-0 lg:block lg:h-screen">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-pop">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="btn-ghost p-2 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <form action="/search" className="relative min-w-0 flex-1 sm:max-w-md">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              placeholder="Search branches, findings, items…"
              aria-label="Global search"
              className="input h-9 pl-8"
            />
          </form>

          <div className="ml-auto flex items-center gap-1">
            <OfflineIndicator />
            <Link
              href="/notifications"
              className="btn-ghost relative p-2"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-5 sm:px-5 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
