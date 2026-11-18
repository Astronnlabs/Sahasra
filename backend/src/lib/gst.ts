/**
 * Business GST setting (Settings → Invoice Settings):
 *  - gstEnabled = false: the business doesn't charge GST — bills carry no GST at all.
 *  - gstFixedRate = 5 / 12 / 18 / 28…: every item is billed at that rate.
 *  - gstFixedRate missing/null: each item's own GST rate (from Products / Services / Menu).
 */
export interface GstSetting {
  enabled: boolean;
  fixedRate: number | null;
}

export function gstSettingOf(settings: unknown): GstSetting {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const rate = typeof s.gstFixedRate === 'number' && s.gstFixedRate >= 0 && s.gstFixedRate <= 40 ? s.gstFixedRate : null;
  return { enabled: s.gstEnabled !== false, fixedRate: rate };
}

/** The GST rate each line is billed at under the business's setting. */
export function applyGst<T extends { gstRate: number }>(items: T[], settings: unknown): T[] {
  const g = gstSettingOf(settings);
  if (g.enabled && g.fixedRate === null) return items;
  return items.map((i) => ({ ...i, gstRate: g.enabled ? (g.fixedRate as number) : 0 }));
}
