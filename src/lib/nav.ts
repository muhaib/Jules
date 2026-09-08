import type { Role } from '@prisma/client';

import { roleHas, type PermissionCode } from '@/lib/auth/permissions';

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  permission?: PermissionCode;
  /** Restrict to specific roles even when the permission is broader. */
  roles?: Role[];
  section: 'work' | 'manage' | 'admin';
};

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard', section: 'work' },
  { href: '/inspections', label: 'Inspections', icon: 'ClipboardCheck', permission: 'inspection:view', section: 'work' },
  { href: '/findings', label: 'Findings', icon: 'TriangleAlert', permission: 'finding:view', section: 'work' },
  { href: '/verification', label: 'Verification Queue', icon: 'ShieldCheck', permission: 'finding:verify', section: 'work' },
  { href: '/branches', label: 'Branches', icon: 'Building2', permission: 'branch:view', section: 'manage' },
  { href: '/reports', label: 'Management Report', icon: 'FileBarChart', permission: 'analytics:view', section: 'manage' },
  { href: '/recurring', label: 'Recurring Issues', icon: 'Repeat', permission: 'analytics:view', section: 'manage' },
  { href: '/templates', label: 'Templates', icon: 'ListChecks', permission: 'template:view', section: 'admin' },
  { href: '/admin/users', label: 'Users', icon: 'Users', permission: 'user:view', section: 'admin' },
  { href: '/admin/settings', label: 'Settings', icon: 'Settings', permission: 'settings:manage', section: 'admin' },
  { href: '/audit', label: 'Audit Trail', icon: 'ScrollText', permission: 'audit:view', section: 'admin' },
];

export function navFor(role: Role) {
  return NAV.filter((item) => {
    if (item.roles && !item.roles.includes(role)) return false;
    if (item.permission && !roleHas(role, item.permission)) return false;
    return true;
  });
}

export const SECTION_LABELS: Record<NavItem['section'], string> = {
  work: 'Work',
  manage: 'Management',
  admin: 'Administration',
};
