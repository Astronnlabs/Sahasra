/**
 * Business GST setting (Settings → Invoice Settings), the same rules the server bills with:
 * GST off → no GST; a fixed rate → every item at that rate; otherwise each item's own rate.
 */
export interface GstSetting {
  enabled: boolean;
  /** null = each item's own rate. */
  fixedRate: number | null;
}

export function gstSettingOf(settings: Record<string, unknown> | undefined): GstSetting {
  const rate = settings?.gstFixedRate;
  return { enabled: settings?.gstEnabled !== false, fixedRate: typeof rate === 'number' ? rate : null };
}

/** The rate a line is billed at. */
export const effectiveGst = (itemRate: number, g: GstSetting) => (!g.enabled ? 0 : g.fixedRate ?? itemRate);
