import { useQuery } from '@tanstack/react-query';
import { Copy, Lock, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PERMISSIONS, PERMISSION_MODULES } from '@/app/config/constants';
import { qk, useAppMutation } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { rolesService } from '@/services';
import type { Permission, Role } from '@/types';

function CreateRole({ open, onOpenChange, roles, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; roles: Role[]; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [base, setBase] = useState('');
  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setBase(roles.find((r) => r.name === 'Cashier')?.id ?? '');
    }
  }, [open, roles]);
  const create = useAppMutation(
    () => {
      const from = roles.find((r) => r.id === base);
      return rolesService.create({ name: sanitizeText(name, 40), description: sanitizeText(description, 120) || 'Custom role', permissions: from ? structuredClone(from.permissions) : {} });
    },
    { invalidate: [qk.roles], success: (r) => `Role “${r.name}” created`, onSuccess: (r) => { onOpenChange(false); onCreated(r.id); } },
  );
  const duplicate = roles.some((r) => r.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create custom role"
      description="Start from an existing role and fine-tune permissions."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={name.trim().length < 2 || duplicate} loading={create.isPending} onClick={() => create.mutate(undefined)}>Create role</Button></>}
    >
      <div className="space-y-4 pb-2">
        <FormField label="Role name" required error={duplicate ? 'A role with this name already exists' : undefined}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Floor Supervisor" autoFocus maxLength={40} /></FormField>
        <FormField label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this role do?" maxLength={120} /></FormField>
        <FormField label="Copy permissions from">
          <NativeSelect value={base} onChange={(e) => setBase(e.target.value)}>
            <option value="">Start blank</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </FormField>
      </div>
    </Modal>
  );
}

export function RolesPage() {
  const { data, isLoading } = useQuery({ queryKey: qk.roles, queryFn: rolesService.list });
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Record<string, Permission[]> | null>(null);
  const [creating, setCreating] = useState(false);
  const role = data?.find((r) => r.id === selectedId) ?? data?.find((r) => r.name === 'Manager') ?? data?.[0];
  const perms = draft ?? role?.permissions ?? {};
  const locked = role?.name === 'Owner';
  const dirty = draft !== null;

  useEffect(() => setDraft(null), [selectedId]);

  const save = useAppMutation(() => rolesService.update(role!.id, { permissions: draft! }), {
    invalidate: [qk.roles],
    success: (r) => `Permissions for ${r.name} saved`,
    onSuccess: () => setDraft(null),
  });

  // Built-in roles stay; a custom role can go once nobody uses it.
  const del = useDeleteAction<Role>({
    page: 'roles',
    name: (r) => `the ${r.name} role`,
    remove: (r) => rolesService.remove(r.id),
    invalidate: [qk.roles],
    hidden: (r) => r.system,
    description: (r) => (r.members ? `${r.members} user${r.members === 1 ? ' has' : 's have'} this role — give them another role first.` : 'No users have this role.'),
    onDeleted: () => setSelectedId(''),
  });

  const toggle = (module: string, perm: Permission, on: boolean) => {
    const current = perms[module] ?? [];
    // Any permission implies View; removing View removes everything for that module.
    const next: Permission[] = on ? Array.from(new Set([...current, perm, 'view'])) : perm === 'view' ? [] : current.filter((p) => p !== perm);
    setDraft({ ...perms, [module]: next });
  };
  const toggleColumn = (perm: Permission, on: boolean) => {
    const next = { ...perms };
    PERMISSION_MODULES.forEach((m) => {
      const cur = next[m] ?? [];
      next[m] = on ? Array.from(new Set([...cur, perm, 'view' as Permission])) : cur.filter((p) => p !== perm);
    });
    setDraft(next);
  };
  const toggleRow = (module: string, on: boolean) => setDraft({ ...perms, [module]: on ? PERMISSIONS.map((p) => p.id) : [] });

  const count = useMemo(() => Object.values(perms).reduce((s, p) => s + p.length, 0), [perms]);

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Decide exactly what each role can see and do."
        actions={
          <>
            <Button variant="secondary" asChild><Link to="/users"><Users /> Users</Link></Button>
            <Button onClick={() => setCreating(true)}><Plus /> Create custom role</Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-2">
          {isLoading
            ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="m-1 h-14 rounded-xl" />)
            : data?.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  aria-current={role?.id === r.id}
                  className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', role?.id === r.id ? 'bg-primary-light' : 'hover:bg-surface')}
                >
                  <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', role?.id === r.id ? 'bg-primary text-white' : 'bg-surface text-muted-foreground')}>
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">{r.name}{!r.system && <Badge tone="primary">Custom</Badge>}</span>
                    <span className="flex items-center gap-1 text-2xs text-muted-foreground"><Users className="h-3 w-3" /> {r.members} members</span>
                  </span>
                </button>
              ))}
        </Card>

        {role ? (
          <Card className="min-w-0 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-[17px] font-semibold">{role.name} {locked && <Lock className="h-4 w-4 text-subtle" aria-label="Locked" />}</h2>
                <p className="text-[13px] text-muted-foreground">{role.description} · {count} permissions</p>
              </div>
              <div className="flex gap-2">
                {del.can(role) && <Button variant="ghost" className="text-danger" onClick={() => del.ask(role)}><Trash2 /> Delete</Button>}
                <Button variant="secondary" onClick={() => setCreating(true)}><Copy /> Duplicate</Button>
                <Button onClick={() => save.mutate(undefined)} disabled={!dirty || locked} loading={save.isPending}><Save /> Save changes</Button>
              </div>
            </div>
            {locked && <p className="border-b border-border bg-surface/60 px-5 py-2.5 text-xs text-muted-foreground">The Owner role always has full access and can’t be edited.</p>}
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-surface/60">
                    <th scope="col" className="px-5 py-3 text-left text-2xs font-semibold uppercase tracking-wider text-subtle">Module</th>
                    {PERMISSIONS.map((p) => {
                      const all = PERMISSION_MODULES.every((m) => perms[m]?.includes(p.id));
                      const some = PERMISSION_MODULES.some((m) => perms[m]?.includes(p.id));
                      return (
                        <th key={p.id} scope="col" className="px-2 py-3 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="whitespace-nowrap text-2xs font-semibold uppercase tracking-wider text-subtle">{p.label}</span>
                            <Checkbox checked={all ? true : some ? 'indeterminate' : false} disabled={locked} onCheckedChange={(c) => toggleColumn(p.id, c === true)} aria-label={`Toggle ${p.label} for all modules`} />
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_MODULES.map((m) => {
                    const row = perms[m] ?? [];
                    return (
                      <tr key={m} className="border-b border-border last:border-0 hover:bg-primary-soft/50">
                        <th scope="row" className="px-5 py-2.5 text-left font-medium">
                          <label className="flex cursor-pointer items-center gap-2.5">
                            <Checkbox checked={row.length === PERMISSIONS.length ? true : row.length ? 'indeterminate' : false} disabled={locked} onCheckedChange={(c) => toggleRow(m, c === true)} aria-label={`Toggle all permissions for ${m}`} />
                            {m}
                          </label>
                        </th>
                        {PERMISSIONS.map((p) => (
                          <td key={p.id} className="px-2 py-2.5 text-center">
                            <Checkbox className="mx-auto" checked={row.includes(p.id)} disabled={locked} onCheckedChange={(c) => toggle(m, p.id, c === true)} aria-label={`${p.label} ${m}`} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          !isLoading && <Card><EmptyState icon={ShieldCheck} title="No roles yet." description="Create a role to control access." actionLabel="Create role" onAction={() => setCreating(true)} /></Card>
        )}
      </div>
      <CreateRole open={creating} onOpenChange={setCreating} roles={data ?? []} onCreated={setSelectedId} />
      {del.dialog}
    </>
  );
}
