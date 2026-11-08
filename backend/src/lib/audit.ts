import type { Request } from 'express';
import { db, type Tx } from '../db.js';

type Action = 'created' | 'edited' | 'deleted' | 'approved' | 'exported' | 'logged in' | 'refunded';

/** Records who changed what. Never throws — auditing must not break the request. */
export async function audit(req: Request, action: Action, module: string, target: string, details = '', tx?: Tx) {
  const a = req.auth;
  const user = a ? (a.impersonating ? `${a.user.name} (Sahasra Support)` : a.user.name) : 'System';
  try {
    await (tx ?? db).auditLog.create({
      data: { tenantId: a?.tenantId ?? null, userId: a?.user.id ?? null, user, action, module, target: target.slice(0, 200), details: details.slice(0, 500), ip: req.ip ?? '' },
    });
  } catch (e) {
    console.error('audit failed', e);
  }
}

/** Adds an in-app notification for a business. */
export async function notify(tenantId: string, kind: string, title: string, message: string, href?: string, tx?: Tx) {
  try {
    await (tx ?? db).notification.create({ data: { tenantId, kind, title, message, href } });
  } catch (e) {
    console.error('notify failed', e);
  }
}
