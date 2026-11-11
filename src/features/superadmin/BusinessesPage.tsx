import { useQuery } from '@tanstack/react-query';
import { Ban, Building2, CalendarPlus, CreditCard, Eye, KeyRound, LogIn, MapPin, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUSINESS_TYPE_MAP, BUSINESS_TYPES } from '@/app/config/business';
import { ALL_PAGE_IDS } from '@/app/config/pages';
import { StatCard } from '@/components/common/StatCard';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PLAN_LABEL } from '@/app/config/constants';
import { useAppMutation } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatDate, formatINR, formatNumber, timeAgo } from '@/lib/format';
import { tenantsService } from '@/services';
import type { Plan, Tenant } from '@/types';
import { PK } from './platformKeys';
import { BusinessAvatar } from './BusinessAvatar';
import { PlanModal } from './PlanModal';
import { useSupportMode } from './useSupportMode';

const PLANS: Plan[] = ['trial', 'starter', 'growth', 'enterprise'];

export function BusinessesPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: PK.tenants, queryFn: tenantsService.list });
  const [planFor, setPlanFor] = useState<Tenant | null>(null);
  const [suspending, setSuspending] = useState<Tenant | null>(null);
  const supportMode = useSupportMode();
  const open = (t: Tenant) => navigate(`/superadmin/businesses/${t.id}`);

  const setStatus = useAppMutation(({ id, status }: { id: string; status: Tenant['status'] }) => tenantsService.setStatus(id, status), {
    invalidate: [PK.all],
    success: (t) => `${t.name} is now ${t.status}`,
    onSuccess: () => setSuspending(null),
  });
  const del = useDeleteAction<Tenant>({
    name: (t) => t.name,
    remove: (t) => tenantsService.remove(t.id, t.name),
    invalidate: [PK.all],
    confirmText: (t) => t.name,
    description: (t) => `This permanently erases ${t.name} and everything in it — ${t.users} user login${t.users === 1 ? '' : 's'}, products, customers, invoices, purchases, staff and settings. To keep the data, suspend the business instead.`,
  });
  const extend = useAppMutation((id: string) => tenantsService.extendTrial(id, 7), { invalidate: [PK.all], success: (t) => `Trial for ${t.name} extended to ${formatDate(t.trialEndsAt!)}` });

  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      active: list.filter((t) => t.status === 'active').length,
      trial: list.filter((t) => t.status === 'trial').length,
      suspended: list.filter((t) => t.status === 'suspended' || t.status === 'churned').length,
      mrr: list.reduce((s, t) => s + t.mrr, 0),
    };
  }, [data]);
  const cities = useMemo(() => Array.from(new Set((data ?? []).map((t) => t.city))).sort(), [data]);

  const columns: Column<Tenant>[] = [
    {
      id: 'name',
      header: 'Business',
      hideable: false,
      sortValue: (t) => t.name,
      cell: (t) => {
        return (
          <div className="flex items-center gap-3">
            <BusinessAvatar tenant={t} />
            <div className="min-w-0">
              <p className="max-w-[220px] truncate font-medium">{t.name}</p>
              <p className="flex items-center gap-1 text-2xs text-subtle">{BUSINESS_TYPE_MAP[t.type]?.label} · {t.city}{t.location && <MapPin className="h-3 w-3 text-success" aria-label="Location captured" />}</p>
            </div>
          </div>
        );
      },
    },
    { id: 'owner', header: 'Owner', sortValue: (t) => t.ownerName, cell: (t) => <div><p>{t.ownerName}</p><p className="text-2xs text-subtle">{t.ownerEmail}</p></div> },
    { id: 'plan', header: 'Plan', sortValue: (t) => PLANS.indexOf(t.plan), cell: (t) => <Badge tone={t.plan === 'enterprise' ? 'primary' : t.plan === 'trial' ? 'info' : 'neutral'}>{PLAN_LABEL[t.plan]}</Badge> },
    {
      id: 'pages',
      header: 'Page access',
      sortValue: (t) => (t.access ?? ALL_PAGE_IDS).length,
      cell: (t) => <span className="inline-flex items-center gap-1 text-muted-foreground"><KeyRound className="h-3.5 w-3.5 text-subtle" />{(t.access ?? ALL_PAGE_IDS).length} / {ALL_PAGE_IDS.length}</span>,
    },
    { id: 'users', header: 'Users', align: 'right', sortValue: (t) => t.users, cell: (t) => t.users },
    { id: 'mrr', header: 'MRR', align: 'right', sortValue: (t) => t.mrr, cell: (t) => (t.mrr ? formatINR(t.mrr) : <span className="text-subtle">—</span>) },
    { id: 'joined', header: 'Joined', sortValue: (t) => t.createdAt, cell: (t) => <span className="text-muted-foreground">{formatDate(t.createdAt)}</span> },
    { id: 'active', header: 'Last active', sortValue: (t) => t.lastActive, defaultHidden: true, cell: (t) => timeAgo(t.lastActive) },
    { id: 'status', header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
  ];

  return (
    <>
      <PageHeader title="Businesses" description="Every customer account on the Sahaasra platform." actions={<Button onClick={() => navigate('/superadmin/businesses/new')}><Plus /> Add business</Button>} />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Paying businesses" value={formatNumber(stats.active)} icon={Building2} loading={isLoading} />
        <StatCard label="On free trial" value={formatNumber(stats.trial)} icon={CalendarPlus} loading={isLoading} />
        <StatCard label="Suspended / churned" value={formatNumber(stats.suspended)} icon={Ban} loading={isLoading} />
        <StatCard label="MRR" value={formatINR(stats.mrr)} icon={CreditCard} loading={isLoading} accent />
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(t) => t.id}
        searchText={(t) => `${t.name} ${t.legalName ?? ''} ${t.ownerName} ${t.ownerEmail} ${t.phone} ${t.city} ${t.gstin ?? ''}`}
        searchPlaceholder="Search business, owner, email or GSTIN"
        onRowClick={open}
        initialSort={{ id: 'joined', dir: 'desc' }}
        filters={[
          { id: 'status', label: 'Statuses', options: ['active', 'trial', 'suspended', 'churned'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), predicate: (t, v) => t.status === v },
          { id: 'plan', label: 'Plans', options: PLANS.map((p) => ({ value: p, label: PLAN_LABEL[p] })), predicate: (t, v) => t.plan === v },
          { id: 'type', label: 'Industries', options: BUSINESS_TYPES.map((b) => ({ value: b.id, label: b.label })), predicate: (t, v) => t.type === v },
          { id: 'city', label: 'Cities', options: cities.map((c) => ({ value: c, label: c })), predicate: (t, v) => t.city === v },
        ]}
        rowActions={[
          { label: 'View business', icon: Eye, onSelect: open },
          { label: 'Edit details', icon: Pencil, onSelect: (t) => navigate(`/superadmin/businesses/${t.id}/edit`) },
          { label: 'Manage page access', icon: KeyRound, onSelect: (t) => navigate(`/superadmin/businesses/${t.id}?tab=access`) },
          { label: 'Open in support mode', icon: LogIn, onSelect: (t) => supportMode(t), hidden: (t) => t.status === 'suspended' || t.status === 'churned' },
          { label: 'Change plan', icon: CreditCard, onSelect: setPlanFor },
          { label: 'Extend trial by 7 days', icon: CalendarPlus, onSelect: (t) => extend.mutate(t.id), hidden: (t) => t.status !== 'trial' },
          { label: 'Reactivate', icon: RotateCcw, onSelect: (t) => setStatus.mutate({ id: t.id, status: t.plan === 'trial' ? 'trial' : 'active' }), hidden: (t) => t.status !== 'suspended' && t.status !== 'churned' },
          { label: 'Suspend business', icon: Ban, destructive: true, onSelect: setSuspending, hidden: (t) => t.status === 'suspended' || t.status === 'churned' },
          del.action,
        ]}
        empty={<EmptyState icon={Building2} title="No businesses yet." description="Add your first customer business to get started." actionLabel="Add business" onAction={() => navigate('/superadmin/businesses/new')} />}
      />

      <PlanModal tenant={planFor} onClose={() => setPlanFor(null)} />
      <ConfirmDialog
        open={!!suspending}
        onOpenChange={(o) => !o && setSuspending(null)}
        title={`Suspend ${suspending?.name}?`}
        description="All users of this business are blocked from signing in until you reactivate it. Their data is kept safe."
        confirmLabel="Suspend business"
        destructive
        loading={setStatus.isPending}
        onConfirm={() => suspending && setStatus.mutate({ id: suspending.id, status: 'suspended' })}
      />
      {del.dialog}
    </>
  );
}
