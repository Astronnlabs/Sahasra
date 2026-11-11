import { Download, Eye, MessageCircle, Plus, UserCheck, Users, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { qk, useCustomers } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { customersService } from '@/services';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import { openWhatsApp } from '@/lib/share';
import { downloadTextFile, toCsv } from '@/lib/utils';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import type { Customer } from '@/types';
import { PartyFormDrawer } from './PartyFormDrawer';

export function CustomersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useCustomers();
  const { businessName } = useWorkspace();
  const [open, setOpen] = useState(params.get('new') === '1');
  const del = useDeleteAction<Customer>({
    page: 'customers',
    name: (c) => c.name,
    remove: (c) => customersService.remove(c.id),
    invalidate: [qk.customers],
    description: () => 'Their past invoices stay in Sales under their name.',
  });

  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      active: list.filter((c) => c.status === 'active').length,
      outstanding: list.reduce((s, c) => s + c.outstanding, 0),
      overdue: list.filter((c) => c.status === 'overdue').length,
    };
  }, [data]);

  const columns: Column<Customer>[] = [
    {
      id: 'customer',
      header: 'Customer',
      hideable: false,
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.name} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium">
              {c.name} {c.tags.map((t) => <Badge key={t} tone="primary">{t}</Badge>)}
            </p>
            <p className="text-2xs text-subtle">{c.city}{c.gstin ? ' · B2B' : ''}</p>
          </div>
        </div>
      ),
    },
    { id: 'phone', header: 'Phone', cell: (c) => <span className="text-muted-foreground">{c.phone}</span> },
    { id: 'orders', header: 'Orders', align: 'right', sortValue: (c) => c.orders, cell: (c) => formatNumber(c.orders) },
    { id: 'spend', header: 'Total Spend', align: 'right', sortValue: (c) => c.totalSpend, cell: (c) => <span className="font-medium">{formatINR(c.totalSpend)}</span> },
    {
      id: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      sortValue: (c) => c.outstanding,
      cell: (c) => (c.outstanding ? <span className="font-semibold text-danger">{formatINR(c.outstanding)}</span> : <span className="text-subtle">—</span>),
    },
    { id: 'last', header: 'Last Purchase', sortValue: (c) => c.lastPurchase, cell: (c) => <span className="text-muted-foreground">{formatDate(c.lastPurchase)}</span> },
    { id: 'email', header: 'Email', defaultHidden: true, cell: (c) => c.email },
    { id: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Know every customer — their purchases, dues and history."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!data?.length}
              onClick={() => {
                downloadTextFile('sahaasra-customers.csv', toCsv((data ?? []).map((c) => ({ Name: c.name, Phone: c.phone, City: c.city, Orders: c.orders, 'Total Spend': c.totalSpend, Outstanding: c.outstanding }))), 'text/csv');
                toast.success('Customers exported');
              }}
            >
              <Download /> Export
            </Button>
            <Button onClick={() => setOpen(true)}><Plus /> Add Customer</Button>
          </>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total customers" value={formatNumber(stats.total)} icon={Users} loading={isLoading} />
        <StatCard label="Active customers" value={formatNumber(stats.active)} icon={UserCheck} loading={isLoading} hint="bought in 75 days" />
        <StatCard label="Total outstanding" value={formatINR(stats.outstanding)} icon={Wallet} loading={isLoading} hint="receivables" />
        <StatCard label="Overdue accounts" value={stats.overdue} icon={MessageCircle} loading={isLoading} hint="send reminders" />
      </div>

      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(c) => c.id}
        searchText={(c) => `${c.name} ${c.phone} ${c.email} ${c.city}`}
        searchPlaceholder="Search name, phone or city"
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        filters={[
          { id: 'status', label: 'Statuses', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'overdue', label: 'Overdue' }], predicate: (c, v) => c.status === v },
          { id: 'dues', label: 'Dues', options: [{ value: 'yes', label: 'Has outstanding' }, { value: 'no', label: 'No outstanding' }], predicate: (c, v) => (v === 'yes' ? c.outstanding > 0 : c.outstanding === 0) },
        ]}
        rowActions={[
          { label: 'View profile', icon: Eye, onSelect: (c) => navigate(`/customers/${c.id}`) },
          {
            label: 'Send payment reminder',
            icon: MessageCircle,
            hidden: (c) => c.outstanding === 0,
            onSelect: (c) =>
              openWhatsApp(c.phone, `Hello ${c.name}, this is a friendly reminder from ${businessName}. Your pending balance is ${formatINR(c.outstanding)}${c.dueDate ? `, due on ${formatDate(c.dueDate)}` : ''}. Thank you!`),
          },
          del.action,
        ]}
        empty={<EmptyState icon={Users} title="No customers yet." description="Start building your customer base by creating your first customer." actionLabel="Add Customer" onAction={() => setOpen(true)} />}
      />

      <PartyFormDrawer
        kind="customer"
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && params.get('new')) setParams({}, { replace: true });
        }}
      />
      {del.dialog}
    </>
  );
}
