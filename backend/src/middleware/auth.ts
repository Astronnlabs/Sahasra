import type { NextFunction, Request, Response } from 'express';
import type { Tenant } from '@prisma/client';
import { config } from '../config.js';
import { db } from '../db.js';
import { normaliseAccess, PAGE_MODULE, type PageId, type Permission } from '../lib/access.js';
import { findSession } from '../lib/auth.js';
import { forbidden, unauthorized } from '../lib/http.js';

export interface AuthContext {
  sessionId: string;
  user: { id: string; name: string; email: string; phone: string | null; role: string; tenantId: string | null; branch: string };
  isSuperAdmin: boolean;
  /** Effective business: the user's own, or the one a Super Admin is supporting. */
  tenantId: string | null;
  tenant: Tenant | null;
  impersonating: boolean;
  /** 'all' for owners/admins/support mode, otherwise the role's permission map. */
  permissions: 'all' | Record<string, Permission[]>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/** Resolves the session cookie into req.auth (does not reject anonymous requests). */
export async function loadAuth(req: Request, _res: Response, next: NextFunction) {
  const session = await findSession(req.cookies?.[config.sessionCookie]);
  if (!session || session.user.status === 'suspended') return next();
  const u = session.user;
  const isSuperAdmin = u.role === 'Super Admin';
  let tenant = u.tenant;
  let impersonating = false;
  if (isSuperAdmin && session.impersonateTenantId) {
    tenant = await db.tenant.findUnique({ where: { id: session.impersonateTenantId } });
    impersonating = !!tenant;
  }
  let permissions: AuthContext['permissions'] = 'all';
  if (!isSuperAdmin && tenant && !['Owner', 'Admin'].includes(u.role)) {
    const role = await db.role.findUnique({ where: { tenantId_name: { tenantId: tenant.id, name: u.role } } });
    permissions = (role?.permissions as Record<string, Permission[]>) ?? {};
  }
  req.auth = {
    sessionId: session.id,
    user: { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, tenantId: u.tenantId, branch: u.branch },
    isSuperAdmin,
    tenantId: tenant?.id ?? null,
    tenant: tenant ?? null,
    impersonating,
    permissions,
  };
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized();
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized();
  if (!req.auth.isSuperAdmin) throw forbidden('Only the Sahaasra platform owner can do this.');
  next();
}

/** Requires a business context that is not suspended. */
export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  const a = req.auth;
  if (!a) throw unauthorized();
  if (!a.tenant) throw forbidden(a.isSuperAdmin ? 'Open a business in support mode first.' : 'Your account is not linked to a business.');
  if (a.tenant.status === 'suspended' || a.tenant.status === 'churned') throw forbidden(`${a.tenant.name} is suspended. Please contact Sahaasra support.`);
  next();
}

const METHOD_ACTION: Record<string, Permission> = { GET: 'view', HEAD: 'view', POST: 'create', PUT: 'edit', PATCH: 'edit', DELETE: 'delete' };

/** Whether the caller may use `page` with `action` (page access + role permission). */
export function can(a: AuthContext, page: PageId, action: Permission = 'view') {
  if (!a.tenant) return false;
  if (a.tenant.access !== null && !normaliseAccess(a.tenant.access).includes(page)) return false;
  if (a.permissions === 'all') return true;
  const module = PAGE_MODULE[page];
  return !module || (a.permissions[module] ?? []).includes(action);
}

/**
 * Enforces page access (set by the Super Admin) and role permissions (set by the business).
 * `action` overrides the permission implied by the HTTP method (e.g. 'refund').
 */
export function guard(page: PageId | PageId[], action?: Permission) {
  const pages = Array.isArray(page) ? page : [page];
  return (req: Request, _res: Response, next: NextFunction) => {
    const a = req.auth;
    if (!a?.tenant) throw unauthorized();
    const access = a.tenant.access === null ? null : normaliseAccess(a.tenant.access);
    if (access && !pages.some((p) => access.includes(p))) throw forbidden('This page is not enabled for your business.');
    if (a.permissions !== 'all') {
      const need = action ?? METHOD_ACTION[req.method] ?? 'view';
      const ok = pages.some((p) => {
        const module = PAGE_MODULE[p];
        if (!module) return true;
        const perms = a.permissions === 'all' ? [] : a.permissions[module] ?? [];
        return perms.includes(need);
      });
      if (!ok) throw forbidden(`Your role (${a.user.role}) is not allowed to ${need === 'view' ? 'view' : need} this.`);
    }
    next();
  };
}

/** Blocks cross-site form posts: mutations must come from our app with a custom header. */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-sahaasra-client') !== 'web') {
    throw forbidden('Request blocked: missing client header.');
  }
  next();
}

/** The current business id — only valid after requireTenant. */
export const tid = (req: Request) => req.auth!.tenantId!;
