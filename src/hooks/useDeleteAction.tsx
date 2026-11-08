import type { QueryKey } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PAGE_MODULE } from '@/app/config/pages';
import { useAuth } from '@/app/providers/AuthProvider';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import type { RowAction } from '@/components/tables/DataTable';
import { Input } from '@/components/ui/input';
import { useAppMutation } from './queries';

interface Options<T> {
  /** Page id; the action is hidden when the user's role can't delete there. */
  page?: string;
  /** Shown in the dialog and the success message. */
  name: (row: T) => string;
  remove: (row: T) => Promise<unknown>;
  invalidate: QueryKey[];
  /** What happens to related records, e.g. "Past invoices keep the name." */
  description?: (row: T) => string;
  /** Hide the action for rows that can't be deleted. */
  hidden?: (row: T) => boolean;
  /** Require typing this text (e.g. the business name) before deleting. */
  confirmText?: (row: T) => string;
  onDeleted?: (row: T) => void;
}

/** A "Delete" row action with its confirmation dialog. Render `dialog` once in the page. */
export function useDeleteAction<T>(o: Options<T>) {
  const { hasPermission } = useAuth();
  const module = o.page ? PAGE_MODULE[o.page] : null;
  const allowed = !module || hasPermission(module, 'delete');
  const [target, setTarget] = useState<T | null>(null);
  const [typed, setTyped] = useState('');
  const del = useAppMutation(
    async (row: T) => {
      await o.remove(row);
      return row;
    },
    {
      invalidate: o.invalidate,
      success: (row) => `${o.name(row)} deleted`,
      onSuccess: (row) => {
        setTarget(null);
        o.onDeleted?.(row);
      },
    },
  );
  const ask = (row: T) => {
    setTyped('');
    setTarget(row);
  };
  const mustType = target && o.confirmText ? o.confirmText(target) : null;
  const action: RowAction<T> = { label: 'Delete', icon: Trash2, destructive: true, onSelect: ask, hidden: (row) => !allowed || !!o.hidden?.(row) };
  const dialog = (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && setTarget(null)}
      title={target ? `Delete ${o.name(target)}?` : ''}
      description={target ? `${o.description?.(target) ?? ''} This can't be undone.`.trim() : ''}
      confirmLabel="Delete"
      destructive
      loading={del.isPending}
      confirmDisabled={!!mustType && typed.trim() !== mustType}
      onConfirm={() => target && del.mutate(target)}
    >
      {mustType && (
        <div className="space-y-2 pb-2">
          <p className="text-[13px]">
            Type <span className="font-semibold">{mustType}</span> to confirm.
          </p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label="Type the name to confirm" />
        </div>
      )}
    </ConfirmDialog>
  );
  /** For pages with their own menus: whether to show Delete for this row. */
  const can = (row: T) => !action.hidden?.(row);
  return { action, dialog, ask, can };
}
