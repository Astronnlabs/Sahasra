import type { Request, Router } from 'express';
import type { ZodType } from 'zod';
import { guard, requireTenant, tid } from '../middleware/auth.js';
import type { PageId } from './access.js';
import { audit } from './audit.js';
import { notFound } from './http.js';
import { plain } from './serialize.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Minimal shape shared by Prisma model delegates. */
interface Delegate {
  findMany(args: any): Promise<any[]>;
  findFirst(args: any): Promise<any>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  delete(args: any): Promise<any>;
}

interface CrudOptions {
  path: string;
  /** Pages that may read this resource. */
  page: PageId | PageId[];
  /** Pages that may change it (defaults to page). */
  writePage?: PageId | PageId[];
  module: string;
  model: Delegate;
  create: ZodType<any, any, any>;
  update?: ZodType<any, any, any>;
  out?: (row: any) => unknown;
  label: (row: any) => string;
  orderBy?: Record<string, 'asc' | 'desc'>;
  include?: Record<string, unknown>;
  /** Extra checks or derived fields before writing. */
  beforeCreate?: (req: Request, data: any) => Promise<any> | any;
  beforeUpdate?: (req: Request, data: any, existing: any) => Promise<any> | any;
  afterUpdate?: (req: Request, row: any, existing: any) => Promise<void> | void;
  allowDelete?: boolean;
  /** Throws to block a delete (e.g. dues pending) and cleans up related rows. */
  beforeDelete?: (req: Request, existing: any) => Promise<void> | void;
}

/** Registers tenant-scoped list/get/create/update/delete routes for a simple resource. */
export function crud(router: Router, o: CrudOptions) {
  const out = o.out ?? ((r: any) => plain(r));
  const write = o.writePage ?? o.page;
  const find = async (req: Request) => {
    const row = await o.model.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) }, include: o.include });
    if (!row) throw notFound(o.module);
    return row;
  };

  router.get(o.path, requireTenant, guard(o.page), async (req, res) => {
    const rows = await o.model.findMany({ where: { tenantId: tid(req) }, orderBy: o.orderBy ?? { createdAt: 'desc' }, include: o.include });
    res.json(rows.map(out));
  });

  router.get(`${o.path}/:id`, requireTenant, guard(o.page), async (req, res) => {
    res.json(out(await find(req)));
  });

  router.post(o.path, requireTenant, guard(write), async (req, res) => {
    let data = o.create.parse(req.body);
    if (o.beforeCreate) data = await o.beforeCreate(req, data);
    const row = await o.model.create({ data: { ...data, tenantId: tid(req) }, include: o.include });
    await audit(req, 'created', o.module, o.label(row));
    res.status(201).json(out(row));
  });

  const updateSchema = o.update ?? (o.create as any).partial?.() ?? o.create;
  const doUpdate = async (req: Request) => {
    const existing = await find(req);
    let data = updateSchema.parse(req.body);
    if (o.beforeUpdate) data = await o.beforeUpdate(req, data, existing);
    const row = await o.model.update({ where: { id: existing.id }, data, include: o.include });
    if (o.afterUpdate) await o.afterUpdate(req, row, existing);
    await audit(req, 'edited', o.module, o.label(row), `Changed: ${Object.keys(data).join(', ')}`);
    return row;
  };
  router.put(`${o.path}/:id`, requireTenant, guard(write), async (req, res) => res.json(out(await doUpdate(req))));
  router.patch(`${o.path}/:id`, requireTenant, guard(write), async (req, res) => res.json(out(await doUpdate(req))));

  if (o.allowDelete !== false) {
    router.delete(`${o.path}/:id`, requireTenant, guard(write), async (req, res) => {
      const existing = await find(req);
      if (o.beforeDelete) await o.beforeDelete(req, existing);
      await o.model.delete({ where: { id: existing.id } });
      await audit(req, 'deleted', o.module, o.label(existing));
      res.json({ id: existing.id });
    });
  }
}
