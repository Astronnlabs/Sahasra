import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Please sign in to continue.') => new HttpError(401, msg);
export const forbidden = (msg = 'You do not have access to this.') => new HttpError(403, msg);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found.`);
export const conflict = (msg: string) => new HttpError(409, msg);

/** Central error handler: consistent JSON errors, no stack traces leaked to clients. */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  void next;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    // Custom messages are already human-readable; generic ones get the field name for context.
    const generic = first && /^(Required|Invalid|Expected|String must|Number must|Array must)/.test(first.message);
    const msg = !first ? 'Invalid input' : generic && first.path.length ? `${first.path.join('.')}: ${first.message}` : first.message;
    res.status(400).json({ error: msg, details: err.flatten().fieldErrors });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const fields = (err.meta?.target as string[] | undefined)?.join(', ');
      res.status(409).json({ error: `A record with the same ${fields ?? 'value'} already exists.` });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Record not found.' });
      return;
    }
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}
