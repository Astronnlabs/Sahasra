import { z } from 'zod';

/** Strips control characters and trims user text before it is stored. */
export const text = (max = 200) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .pipe(z.string().max(max));

export const requiredText = (label: string, max = 200, min = 1) =>
  text(max).pipe(z.string().min(min, `${label} is required`));

export const optionalText = (max = 200) =>
  z
    .union([text(max), z.null()])
    .optional()
    .transform((v) => (v ? v : undefined));

export const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const phone = z.string().trim().regex(PHONE_RE, 'Enter a valid 10-digit mobile number');
export const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined)
  .refine((v) => !v || PHONE_RE.test(v), 'Enter a valid 10-digit mobile number');
export const email = z.string().trim().toLowerCase().email('Enter a valid email');
export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((v) => v || undefined)
  .refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email');
export const upperOptional = (re: RegExp, msg: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || re.test(v), msg);

export const money = z.coerce.number().min(0, 'Cannot be negative').max(1e12);
export const positiveMoney = z.coerce.number().positive('Must be greater than 0').max(1e12);
export const int = z.coerce.number().int('Whole numbers only');
export const isoDate = z.coerce.date({ invalid_type_error: 'Enter a valid date' });

/** Strong-enough password policy. */
export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain letters and numbers');

export const phoneKey = (p?: string | null) => {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
};
