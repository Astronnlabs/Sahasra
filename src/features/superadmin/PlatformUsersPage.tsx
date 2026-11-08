import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Ban, KeyRound, Mail, RotateCcw, UserCheck, UserPlus, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { StatCard } from '@/components/common/StatCard';
import { TempPasswordDialog, type TempLogin } from '@/components/common/TempPasswordDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { useAppMutation } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatDate, formatNumber, timeAgo } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { platformUsersService, tenantsService } from '@/services';
import type { PlatformUser } from '@/types';
import { PK } from './platformKeys';

/** Built-in roles every business has (the Owner is created with the business). */
const ROLES = ['Admin', 'Manager', 'Cashier', 'Accountant', 'HR', 'Inventory Manager', 'Waiter', 'Kitchen Staff'];

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(60),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/, 'Enter a valid 10-digit mobile number'),
  tenantId: z.string().min(1, 'Choose a business'),
  role: z.string().min(1),
});
type Values = z.infer<typeof schema>;

function CreateUserDrawer({ open, onOpenChange, defaultTenantId, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; defaultTenantId?: string; onCreated: (l: TempLogin) => void }) {
  const tenants = useQuery({ queryKey: PK.tenants, queryFn: tenantsService.list });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) reset({ name: '', email: '', phone: '', tenantId: defaultTenantId ?? '', role: 'Manager' });
  }, [open, reset, defaultTenantId]);
  const save = useAppMutation((v: Values) => platformUsersService.invite({ ...v, name: sanitizeText(v.name, 60) }), {
    invalidate: [PK.all],
    success: (u) => `Login created for ${u.name}`,
    onSuccess: (u) => {
      onOpenChange(false);
      onCreated({ name: u.name, login: u.email, password: u.tempPassword });
    },
  });
  const live = (tenants.data ?? []).filter((t) => t.status !== 'churned').sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Create user"
      description="Creates a login inside a business. You’ll get a temporary password to share."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}><UserPlus /> Create login</Button></>}
    >
      <form className="space-y-4" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label="Full name" error={errors.name?.message} required><Input {...register('name')} autoFocus /></FormField>
        <FormField label="Email" error={errors.email?.message} required><Input {...register('email')} type="email" /></FormField>
        <FormField label="Mobile" error={errors.phone?.message} required><Input {...register('phone')} inputMode="tel" /></FormField>
        <FormField label="Business" error={errors.tenantId?.message} required>
          <NativeSelect {...register('tenantId')}>
            <option value="">Select business</option>
            {live.map((t) => <option key={t.id} value={t.id}>{t.name}{t.city ? ` · ${t.city}` : ''}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label="Role"><NativeSelect {...register('role')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</NativeSelect></FormField>
      </form>
    </Drawer>
  );
}

export function PlatformUsersPage() {
  const { data, isLoading } = useQuery({ queryKey: PK.users, queryFn: platformUsersService.list });
  const [params, setParams] = useSearchParams();
  const defaultTenantId = params.get('business') ?? undefined;
  const [open, setOpen] = useState(!!defaultTenantId);
  const [login, setLogin] = useState<TempLogin | null>(null);
  const setStatus = useAppMutation(({ id, status }: { id: string; status: 'active' | 'suspended' }) => platformUsersService.setStatus(id, status), {
    invalidate: [PK.all],
    success: (u) => (u.status === 'suspended' ? `${u.name} suspended and signed out` : `${u.name} reactivated`),
  });
  const resetPassword = useAppMutation((u: PlatformUser) => platformUsersService.resetPassword(u.id).then((r) => ({ ...r, user: u })), {
    invalidate: [PK.all],
    onSuccess: (r) => setLogin({ name: r.user.name, login: r.user.email, password: r.tempPassword }),
  });

  // Owners go with their business (delete the business instead).
  const del = useDeleteAction<PlatformUser>({
    name: (u) => u.name,
    remove: (u) => platformUsersService.remove(u.id),
    invalidate: [PK.all],
    hidden: (u) => u.role === 'Owner',
    description: (u) => `${u.email} (${u.role} at ${u.tenantName}) won't be able to sign in.`,
  });

  const stats = useMemo(() => {
    const list = data ?? [];
    const now = new Date();
    return {
      total: list.length,
      active: list.filter((u) => u.lastLogin && differenceInCalendarDays(now, parseISO(u.lastLogin)) < 7).length,
      new30: list.filter((u) => differenceInCalendarDays(now, parseISO(u.createdAt)) < 30).length,
      invited: list.filter((u) => u.status === 'invited').length,
    };
  }, [data]);

  const columns: Column<PlatformUser>[] = [
    { id: 'name', header: 'User', hideable: false, sortValue: (u) => u.name, cell: (u) => <div className="flex items-center gap-3"><Avatar name={u.name} size="sm" /><div><p className="font-medium">{u.name}</p><p className="text-2xs text-subtle">{u.email}</p></div></div> },
    { id: 'business', header: 'Business', sortValue: (u) => u.tenantName, cell: (u) => <span className="block max-w-[200px] truncate">{u.tenantName}</span> },
    { id: 'role', header: 'Role', sortValue: (u) => u.role, cell: (u) => <Badge tone={u.role === 'Owner' ? 'primary' : 'neutral'}>{u.role}</Badge> },
    { id: 'phone', header: 'Phone', defaultHidden: true, cell: (u) => u.phone },
    { id: 'joined', header: 'Joined', sortValue: (u) => u.createdAt, cell: (u) => <span className="text-muted-foreground">{formatDate(u.createdAt)}</span> },
    { id: 'login', header: 'Last login', sortValue: (u) => u.lastLogin ?? '', cell: (u) => <span className="text-muted-foreground">{u.lastLogin ? timeAgo(u.lastLogin) : 'Never'}</span> },
    { id: 'status', header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
  ];

  return (
    <>
      <PageHeader title="Users" description="Everyone who can sign in to any Sahasra business." actions={<Button onClick={() => setOpen(true)}><UserPlus /> Create user</Button>} />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total users" value={formatNumber(stats.total)} icon={UsersRound} loading={isLoading} />
        <StatCard label="Active this week" value={formatNumber(stats.active)} icon={UserCheck} loading={isLoading} />
        <StatCard label="New in 30 days" value={formatNumber(stats.new30)} icon={UserPlus} loading={isLoading} accent />
        <StatCard label="Never signed in" value={formatNumber(stats.invited)} icon={Mail} loading={isLoading} />
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(u) => u.id}
        searchText={(u) => `${u.name} ${u.email} ${u.phone} ${u.tenantName}`}
        searchPlaceholder="Search name, email, phone or business"
        initialSort={{ id: 'joined', dir: 'desc' }}
        filters={[
          { id: 'status', label: 'Statuses', options: ['active', 'invited', 'suspended'].map((s) => ({ value: s, label: s === 'invited' ? 'Never signed in' : s[0].toUpperCase() + s.slice(1) })), predicate: (u, v) => u.status === v },
          { id: 'role', label: 'Roles', options: ['Owner', ...ROLES].map((r) => ({ value: r, label: r })), predicate: (u, v) => u.role === v },
          { id: 'joined', label: 'Join dates', options: [{ value: '1', label: 'Joined today' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }], predicate: (u, v) => differenceInCalendarDays(new Date(), parseISO(u.createdAt)) < Number(v) },
        ]}
        rowActions={[
          { label: 'Reset password', icon: KeyRound, onSelect: (u) => resetPassword.mutate(u), hidden: (u) => u.status === 'suspended' },
          { label: 'Reactivate', icon: RotateCcw, onSelect: (u) => setStatus.mutate({ id: u.id, status: 'active' }), hidden: (u) => u.status !== 'suspended' },
          { label: 'Suspend', icon: Ban, destructive: true, onSelect: (u) => setStatus.mutate({ id: u.id, status: 'suspended' }), hidden: (u) => u.status === 'suspended' },
          del.action,
        ]}
        empty={<EmptyState icon={UsersRound} title="No users yet." description="Add a business — its owner login is created with it." actionLabel="Create user" onAction={() => setOpen(true)} />}
      />
      <CreateUserDrawer open={open} onOpenChange={(o) => { setOpen(o); if (!o && defaultTenantId) setParams({}, { replace: true }); }} defaultTenantId={defaultTenantId} onCreated={setLogin} />
      <TempPasswordDialog value={login} onClose={() => setLogin(null)} />
      {del.dialog}
    </>
  );
}
