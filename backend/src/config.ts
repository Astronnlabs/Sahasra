import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  /** 32 random bytes, base64. Encrypts each business's VAAHAK connection key. */
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  /** VAAHAK API (sends e-bills on WhatsApp and charges the business's VAAHAK wallet). */
  VAAHAK_API_URL: z.string().url().default('https://vaahak.onrender.com'),
  /** PayU merchant key and salt for plan purchases (hosted checkout). Server only. */
  PAYU_KEY: z.string().optional(),
  PAYU_SALT: z.string().optional(),
  /** live = real money, test = PayU sandbox. */
  PAYU_MODE: z.enum(['live', 'test']).default('live'),
  /** Public https address of this server, as PayU reaches it. Defaults to APP_ORIGIN (same server). */
  PUBLIC_URL: z.string().url().optional(),
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
