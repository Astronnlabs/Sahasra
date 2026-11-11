import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Ban, KeyRound, Mail, Pencil, RotateCcw, ShieldCheck, UserCheck, UserPlus, UserCog } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { TempPasswordDialog, type TempLogin } from '@/components/common/TempPasswordDialog';
import { BRANCHES } from '@/app/config/constants';
import { qk, useAppMutation } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { useAuth } from '@/app/providers/AuthProvider';
import { timeAgo } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { rolesService, usersService } from '@/services';
import type { AppUser } from '@/types';
import { ChangePasswordModal } from './ChangePasswordModal';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(60),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/, 'Enter a valid mobile number'),
  role: z.string().min(1),
  branch: z.string().min(1),
});
type Values = z.infer<typeof schema>;

function UserDrawer({ open, onOpenChange, user, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; user: AppUser | null; onCreated: (login: TempLogin) => void }) {
  const roles = useQuery({ queryKey: qk.roles, queryFn: rolesService.list });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) reset({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', role: user?.role ?? 'Cashier', branch: user?.branch ?? 'Main Branch' });
  }, [open, user, reset]);
  const save = useAppMutation(
    (v: Values) => {
      const data = { ...v, name: sanitizeText(v.name, 60) };
      return user ? usersService.update(user.id, user.role === 'Owner' ? { ...data, role: undefined } : data) : usersService.create(data);
    },
    { invalidate: [qk.users], success: (u) => (user ? `${u.name} updated` : `Login created for ${u.name}`), onSuccess: (u) => {
        onOpenChange(false);
        const tempPassword = (u as { tempPassword?: string }).tempPassword;
        if (tempPassword) onCreated({ name: u.name, login: u.email, password: tempPassword });
      },
    },
  );
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={user ? 'Edit user' : 'Add user'}
      description={user ? user.email : 'Creates their login. You’ll get a temporary password to share with them.'}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>{user ? 'Save changes' : <><UserPlus /> Create login</>}</Button></>}
    >
      <form className="space-y-4" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label="Full name" error={errors.name?.message} required><Input {...register('name')} autoFocus /></FormField>
        <FormField label="Email" error={errors.email?.message} required><Input {...register('email')} type="email" /></FormField>
        <FormField label="Mobile" error={errors.phone?.message} required><Input {...register('phone')} inputMode="tel" /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Role" hint="Controls what they can see and do."><NativeSelect {...register('role')} disabled={user?.role === 'Owner'}>{roles.data?.filter((r) => r.name !== 'Owner' || user?.role === 'Owner').map((r) => <option key={r.id}>{r.name}</option>)}</NativeSelect></FormField>
          <FormField label="Branch access"><NativeSelect {...register('branch')}><option>All Branches</option>{BRANCHES.map((b) => <option key={b.id}>{b.name}</option>)}</NativeSelect></FormField>
        </div>
      </form>
    </Drawer>
  );
}

export function UsersPage() {
  const { data, isLoading } = useQuery({ queryKey: qk.users, queryFn: usersService.list });
  const { user } = useAuth();
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState<TempLogin | null>(null);
  const [passwordFor, setPasswordFor] = useState<AppUser | null>(null);
  const isOwner = user?.role === 'Owner' || user?.role === 'Super Admin';
  const resetPassword = useAppMutation((u: AppUser) => usersService.resetPassword(u.id).then((r) => ({ ...r, user: u })), {
    invalidate: [qk.users],
    onSuccess: (r) => setLogin({ name: r.user.name, login: r.user.email, password: r.tempPassword }),
  });
  const setStatus = useAppMutation(({ id, status }: { id: string; status: 'active' | 'suspended' }) => usersService.update(id, { status }), {
    invalidate: [qk.users],
    success: (u) => `${u.name} is now ${u.status}`,
  });

  const del = useDeleteAction<AppUser>({
    page: 'users',
    name: (u) => u.name,
    remove: (u) => usersService.remove(u.id),
    invalidate: [qk.users, qk.roles],
    hidden: (u) => u.role === 'Owner' || u.id === user?.id,
    description: (u) => `${u.email} won't be able to sign in. Bills and history they created keep their name.`,
  });

  const openForm = (u: AppUser | null) => {
    setEditing(u);
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="People who can sign in to your Sahaasra workspace."
        actions={
          <>
            <Button variant="secondary" asChild><Link to="/roles"><ShieldCheck /> Roles & permissions</Link></Button>
            <Button onClick={() => openForm(null)}><UserPlus /> Add user</Button>
          </>
        }
      />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total users" value={data?.length ?? 0} icon={UserCog} loading={isLoading} />
        <StatCard label="Active" value={data?.filter((u) => u.status === 'active').length ?? 0} icon={UserCheck} loading={isLoading} />
        <StatCard label="Not signed in yet" value={data?.filter((u) => u.status === 'invited').length ?? 0} icon={Mail} loading={isLoading} />
        <StatCard label="Suspended" value={data?.filter((u) => u.status === 'suspended').length ?? 0} icon={Ban} loading={isLoading} />
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        getRowId={(u) => u.id}
        searchText={(u) => `${u.name} ${u.email} ${u.role}`}
        searchPlaceholder="Search users"
        onRowClick={openForm}
        filters={[
          { id: 'role', label: 'Roles', options: Array.from(new Set((data ?? []).map((u) => u.role))).map((r) => ({ value: r, label: r })), predicate: (u, v) => u.role === v },
          { id: 'status', label: 'Statuses', options: ['active', 'invited', 'suspended'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), predicate: (u, v) => u.status === v },
        ]}
        columns={[
          { id: 'name', header: 'User', hideable: false, sortValue: (u) => u.name, cell: (u) => <div className="flex items-center gap-3"><Avatar name={u.name} size="sm" /><div><p className="font-medium">{u.name}</p><p className="text-2xs text-subtle">{u.email}</p></div></div> },
          { id: 'role', header: 'Role', sortValue: (u) => u.role, cell: (u) => <Badge tone={u.role === 'Owner' ? 'primary' : 'neutral'}>{u.role}</Badge> },
          { id: 'branch', header: 'Branch', cell: (u) => u.branch },
          { id: 'phone', header: 'Phone', defaultHidden: true, cell: (u) => u.phone },
          { id: 'active', header: 'Last active', sortValue: (u) => u.lastActive, cell: (u) => <span className="text-muted-foreground">{u.status === 'invited' ? 'Not signed in yet' : timeAgo(u.lastActive)}</span> },
          { id: 'status', header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
        ]}
        rowActions={[
          { label: 'Edit', icon: Pencil, onSelect: openForm },
          { label: 'Change my password', icon: KeyRound, onSelect: setPasswordFor, hidden: (u) => u.id !== user?.id },
          // The owner sets a staff password directly; others get a temporary one to share.
          { label: 'Set new password', icon: KeyRound, onSelect: setPasswordFor, hidden: (u) => !isOwner || u.id === user?.id },
          { label: isOwner ? 'Reset to temporary password' : 'Reset password', icon: RotateCcw, onSelect: (u) => resetPassword.mutate(u), hidden: (u) => u.id === user?.id || u.status === 'suspended' || u.role === 'Owner' },
          { label: 'Reactivate', icon: RotateCcw, onSelect: (u) => setStatus.mutate({ id: u.id, status: 'active' }), hidden: (u) => u.status !== 'suspended' },
          { label: 'Suspend access', icon: Ban, destructive: true, onSelect: (u) => setStatus.mutate({ id: u.id, status: 'suspended' }), hidden: (u) => u.status === 'suspended' || u.role === 'Owner' },
          del.action,
        ]}
        empty={<EmptyState icon={UserCog} title="Only you so far." description="Invite your team and give each person the right access." actionLabel="Add user" onAction={() => openForm(null)} />}
      />
      <UserDrawer open={open} onOpenChange={setOpen} user={editing} onCreated={setLogin} />
      <TempPasswordDialog value={login} onClose={() => setLogin(null)} />
      <ChangePasswordModal user={passwordFor} self={passwordFor?.id === user?.id} direct={isOwner} onClose={() => setPasswordFor(null)} />
      {del.dialog}
    </>
  );
}
