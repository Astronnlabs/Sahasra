import { Prisma } from '@prisma/client';

/**
 * Converts Prisma values into plain JSON-friendly data:
 * Decimal → number (2-decimal money), Date → ISO string.
 */
export function plain<T>(value: T): T {
  return convert(value) as T;
}

function convert(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Prisma.Decimal) return v.toNumber();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(convert);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = convert(val);
    return out;
  }
  return v;
}

/** Rounds to paise. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : typeof d === 'number' ? d : d.toNumber());
