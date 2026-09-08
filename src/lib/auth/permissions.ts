import { Role } from '@prisma/client';

/**
 * Permission catalogue. Every guarded action in the app maps to one of these
 * codes; nothing checks a role name directly outside this file.
 */
export const PERMISSIONS = {
  // Organization & system
  'org:manage': { category: 'System', description: 'Create and configure organizations' },
  'settings:manage': { category: 'System', description: 'Manage scoring rules, deadlines and system settings' },
  'audit:view': { category: 'System', description: 'View the audit trail' },

  // Users
  'user:create': { category: 'Users', description: 'Create users' },
  'user:update': { category: 'Users', description: 'Edit users' },
  'user:view': { category: 'Users', description: 'View users' },

  // Structure
  'branch:create': { category: 'Branches', description: 'Create branches' },
  'branch:update': { category: 'Branches', description: 'Edit branches' },
  'branch:view': { category: 'Branches', description: 'View branches' },
  'region:manage': { category: 'Branches', description: 'Manage regions and clusters' },

  // Templates
  'template:manage': { category: 'Templates', description: 'Create and edit inspection templates' },
  'template:view': { category: 'Templates', description: 'View inspection templates' },

  // Inspections
  'inspection:assign': { category: 'Inspections', description: 'Assign inspections to inspectors' },
  'inspection:conduct': { category: 'Inspections', description: 'Conduct and submit inspections' },
  'inspection:view': { category: 'Inspections', description: 'View inspections and reports' },

  // Findings & corrective actions
  'finding:view': { category: 'Findings', description: 'View findings' },
  'finding:create': { category: 'Findings', description: 'Raise findings outside an inspection' },
  'finding:assign': { category: 'Findings', description: 'Assign a responsible person and deadline' },
  'finding:respond': { category: 'Findings', description: 'Respond and upload corrective-action evidence' },
  'finding:verify': { category: 'Findings', description: 'Accept, reject, reopen or close findings' },

  // Analytics & export
  'analytics:view': { category: 'Analytics', description: 'View dashboards and management analytics' },
  'export:run': { category: 'Analytics', description: 'Export reports to PDF and Excel' },
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

/**
 * Default role → permission matrix, mirroring the operating model:
 * admins configure, regional managers oversee, inspectors record,
 * branch managers remediate, verifiers close.
 */
export const ROLE_PERMISSIONS: Record<Role, PermissionCode[]> = {
  SUPER_ADMIN: Object.keys(PERMISSIONS) as PermissionCode[],

  REGIONAL_MANAGER: [
    'branch:view',
    'user:view',
    'template:view',
    'inspection:assign',
    'inspection:view',
    'finding:view',
    'finding:create',
    'finding:assign',
    'analytics:view',
    'export:run',
    'audit:view',
  ],

  INSPECTOR: [
    'branch:view',
    'template:view',
    'inspection:conduct',
    'inspection:view',
    'finding:view',
  ],

  BRANCH_MANAGER: [
    'branch:view',
    'inspection:view',
    'finding:view',
    'finding:respond',
    'analytics:view',
  ],

  VERIFIER: [
    'branch:view',
    'inspection:view',
    'finding:view',
    'finding:verify',
    'analytics:view',
    'export:run',
  ],
};

export function roleHas(role: Role, permission: PermissionCode): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  REGIONAL_MANAGER: 'Regional Manager',
  INSPECTOR: 'Inspector',
  BRANCH_MANAGER: 'Branch Manager',
  VERIFIER: 'Verifier',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: 'Full control over the organization, users, templates and settings.',
  REGIONAL_MANAGER: 'Oversees assigned regions: assigns inspections, monitors corrective actions.',
  INSPECTOR: 'Conducts inspections in the field and records findings with evidence.',
  BRANCH_MANAGER: 'Responds to findings at their branch and submits corrective-action evidence.',
  VERIFIER: 'Reviews corrective evidence and decides whether a finding can be closed.',
};
