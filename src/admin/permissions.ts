/**
 * Matriz de permissões do Admin Control Center — permissões granulares,
 * nunca apenas `isAdmin = true`.
 *
 * Papéis: SUPER_ADMIN, ADMIN, MODERATOR, CONTENT_MANAGER, SUPPORT, DEVELOPER.
 * Para uma versão online, esta matriz seria validada no servidor
 * (Frontend → API → Auth → Permission System → Database).
 */

export type Permission =
  | 'VIEW_USERS' | 'EDIT_USERS' | 'VIEW_SAVES' | 'EDIT_SAVES'
  | 'CREATE_EVENTS' | 'EDIT_EVENTS' | 'DELETE_EVENTS'
  | 'CREATE_SKINS' | 'EDIT_SKINS'
  | 'CREATE_BANNERS' | 'CREATE_NEWS' | 'CREATE_REWARDS'
  | 'MANAGE_PASSES' | 'MANAGE_SEASONS'
  | 'VIEW_LOGS' | 'VIEW_AUDIT' | 'DEBUG_GAME'
  | 'VIEW_ADMIN' | 'GRANT_REWARDS' | 'BACKUP_RESTORE' | 'MANAGE_CONTENT';

export type AdminRole =
  | 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'CONTENT_MANAGER' | 'SUPPORT' | 'DEVELOPER';

export const ADMIN_ROLES: AdminRole[] = [
  'SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'SUPPORT', 'DEVELOPER',
];

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MODERATOR: 'Moderador',
  CONTENT_MANAGER: 'Content Manager',
  SUPPORT: 'Suporte',
  DEVELOPER: 'Desenvolvedor',
};

const ALL: Permission[] = [
  'VIEW_USERS', 'EDIT_USERS', 'VIEW_SAVES', 'EDIT_SAVES',
  'CREATE_EVENTS', 'EDIT_EVENTS', 'DELETE_EVENTS',
  'CREATE_SKINS', 'EDIT_SKINS',
  'CREATE_BANNERS', 'CREATE_NEWS', 'CREATE_REWARDS',
  'MANAGE_PASSES', 'MANAGE_SEASONS',
  'VIEW_LOGS', 'VIEW_AUDIT', 'DEBUG_GAME',
  'VIEW_ADMIN', 'GRANT_REWARDS', 'BACKUP_RESTORE', 'MANAGE_CONTENT',
];

/** Matriz papel → permissões. */
export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: [...ALL].filter((p) => p !== 'DELETE_EVENTS' && p !== 'EDIT_USERS'),
  MODERATOR: ['VIEW_USERS', 'VIEW_SAVES', 'VIEW_LOGS', 'VIEW_AUDIT', 'VIEW_ADMIN', 'CREATE_NEWS'],
  CONTENT_MANAGER: [
    'VIEW_ADMIN', 'CREATE_EVENTS', 'EDIT_EVENTS', 'CREATE_SKINS', 'EDIT_SKINS',
    'CREATE_BANNERS', 'CREATE_NEWS', 'CREATE_REWARDS', 'MANAGE_PASSES', 'MANAGE_SEASONS',
    'MANAGE_CONTENT', 'GRANT_REWARDS',
  ],
  SUPPORT: ['VIEW_USERS', 'VIEW_SAVES', 'VIEW_LOGS', 'VIEW_ADMIN', 'GRANT_REWARDS'],
  DEVELOPER: ['VIEW_ADMIN', 'DEBUG_GAME', 'VIEW_LOGS', 'VIEW_AUDIT', 'MANAGE_CONTENT', 'BACKUP_RESTORE'],
};

export function roleHas(role: AdminRole, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

/** Permissões de um conjunto de papéis (interseção = todas exigem). */
export function rolesHave(roles: AdminRole[], perm: Permission): boolean {
  if (roles.length === 0) return false;
  return roles.every((r) => roleHas(r, perm));
}

export const ALL_PERMISSIONS: Permission[] = [...ALL];
