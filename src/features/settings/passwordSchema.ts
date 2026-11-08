import { z } from 'zod';

/** Changing your own password: same rules as the server (8+ chars, letters and numbers). */
const newPassword = z.string().min(8, 'At least 8 characters').max(128).refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Use letters and numbers');

export const passwordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    next: newPassword,
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((v) => v.next !== v.current, { path: ['next'], message: 'Choose a new password' });

/** The owner setting a password directly: no current password. */
export const setPasswordSchema = z
  .object({ current: z.string().optional(), next: newPassword, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
