import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { db } from '../db.js';

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Creates a server-side session and sets an httpOnly cookie holding only a random token. */
export async function createSession(req: Request, res: Response, userId: string, remember: boolean) {
  const token = crypto.randomBytes(32).toString('base64url');
  const lifetime = remember ? config.rememberMs : config.shortSessionMs;
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 250),
      ip: req.ip ?? '',
      expiresAt: new Date(Date.now() + lifetime),
    },
  });
  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    path: '/',
    ...(remember ? { maxAge: lifetime } : {}),
  });
}

export async function findSession(token: string | undefined) {
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { include: { tenant: true } } } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  // Sliding activity timestamp, written at most every 5 minutes.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session;
}

export async function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[config.sessionCookie] as string | undefined;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  res.clearCookie(config.sessionCookie, { path: '/' });
}

/** Random temporary password: 12 chars, letters and digits (no lookalikes). */
export function generatePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(letters), pick(digits), ...Array.from({ length: 10 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
