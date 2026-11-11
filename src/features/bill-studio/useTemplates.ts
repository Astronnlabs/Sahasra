import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from '@/components/ui/toast';
import { billTemplatesService, type StoredTemplate } from '@/services';
import { PRESET_TEMPLATES, type InvoiceTemplate } from './model';

export const TEMPLATES_KEY = ['bill-templates'];
const PRESET_IDS = new Set(PRESET_TEMPLATES.map((t) => t.id));

/**
 * Sahaasra's preset templates merged with the business's saved templates (stored on the server).
 * Editing a preset saves the business's own copy under the same id.
 */
export function useTemplates() {
  const qc = useQueryClient();
  const { data: stored = [], isLoading } = useQuery({ queryKey: TEMPLATES_KEY, queryFn: billTemplatesService.list });

  const templates = useMemo<InvoiceTemplate[]>(() => {
    const saved = stored as unknown as InvoiceTemplate[];
    const hasDefault = saved.some((t) => t.isDefault);
    const presets = PRESET_TEMPLATES.filter((p) => !saved.some((s) => s.id === p.id)).map((p) => (hasDefault ? { ...p, isDefault: false } : p));
    return [...presets, ...saved];
  }, [stored]);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }), [qc]);
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save the template.');

  const save = useCallback(
    async (tpl: InvoiceTemplate) => {
      try {
        const { updatedAt: _u, ...body } = tpl;
        void _u;
        await billTemplatesService.save(body as unknown as Omit<StoredTemplate, 'updatedAt'>);
        await refresh();
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!stored.some((t) => t.id === id)) return;
      try {
        await billTemplatesService.remove(id);
        await refresh();
      } catch (e) {
        fail(e);
      }
    },
    [stored, refresh],
  );

  const setDefault = useCallback(
    async (id: string) => {
      const t = templates.find((x) => x.id === id);
      if (!t) return;
      try {
        if (stored.some((s) => s.id === id)) await billTemplatesService.setDefault(id);
        else await save({ ...t, isDefault: true });
        await refresh();
      } catch (e) {
        fail(e);
      }
    },
    [templates, stored, save, refresh],
  );

  /** Discards the business's edits to Sahaasra presets (custom templates are kept). */
  const resetAll = useCallback(async () => {
    try {
      for (const t of stored.filter((s) => PRESET_IDS.has(s.id))) {
        if (t.isDefault) await billTemplatesService.save({ ...(PRESET_TEMPLATES.find((p) => p.id === t.id) as unknown as StoredTemplate), isDefault: true });
        else await billTemplatesService.remove(t.id);
      }
      await refresh();
    } catch (e) {
      fail(e);
    }
  }, [stored, refresh]);

  const defaultTemplate = templates.find((t) => t.isDefault) ?? templates[0];
  return { templates, isLoading, save, remove, setDefault, resetAll, defaultTemplate };
}
