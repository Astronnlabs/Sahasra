import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  uploadDir: path.resolve(parsed.data.UPLOAD_DIR),
  sessionCookie: 'sahasra_sid',
  /** Session lifetime when "Remember me" is ticked. */
  rememberMs: 30 * 24 * 3600 * 1000,
  /** Session lifetime otherwise (browser-session cookie, server-side expiry). */
  shortSessionMs: 12 * 3600 * 1000,
};
