import { Eye, Plus, ShoppingBag, Truck, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { qk, useVendors } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { vendorsService } from '@/services';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import type { Vendor } from '@/types';
import { PartyFormDrawer } from '@/features/customers/PartyFormDrawer';

export function VendorsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useVendors();
  const [open, setOpen] = useState(false);
  const del = useDeleteAction<Vendor>({
    page: 'vendors',
    name: (v) => v.name,
    remove: (v) => vendorsService.remove(v.id),
    invalidate: [qk.vendors],
    description: () => 'Their past purchase bills stay in Purchases under their name.',
  });
  const categories = useMemo(() => Array.from(new Set((data ?? []).map((v) => v.category))), [data]);
  const payable = data?.reduce((s, v) => s + v.payable, 0) ?? 0;

  const columns: Column<Vendor>[] = [
    {
      id: 'vendor',
      header: 'Vendor',
      hideable: false,
      sortValue: (v) => v.name,
      cell: (v) => (
        <div className="flex items-center gap-3">
          <Avatar name={v.name} size="sm" />
          <div className="min-w-0">
            <p className="font-medium">{v.name}</p>
            <p className="text-2xs text-subtle">{v.category} · {v.city}</p>
          </div>
        </div>
      ),
    },
    { id: 'gstin', header: 'GSTIN', cell: (v) => <span className="font-mono text-xs text-muted-foreground">{v.gstin}</span> },
    { id: 'purchases', header: 'Purchases', align: 'right', sortValue: (v) => v.totalPurchased, cell: (v) => <span>{formatINR(v.totalPurchased)} <span className="text-xs text-subtle">· {v.purchases} bills</span></span> },
    { id: 'payable', header: 'Payable', align: 'right', sortValue: (v) => v.payable, cell: (v) => (v.payable ? <span className="font-semibold text-danger">{formatINR(v.payable)}</span> : <span className="text-subtle">—</span>) },
    { id: 'last', header: 'Last Purchase', sortValue: (v) => v.lastPurchase, cell: (v) => <span className="text-muted-foreground">{formatDate(v.lastPurchase)}</span> },
    { id: 'contact', header: 'Contact', defaultHidden: true, cell: (v) => `${v.contact} · ${v.phone}` },
    { id: 'status', header: 'Status', cell: (v) => <StatusBadge status={v.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Suppliers, purchase history and what you owe."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/purchases/new')}><ShoppingBag /> New purchase</Button>
            <Button onClick={() => setOpen(true)}><Plus /> Add Vendor</Button>
          </>
        }
      />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-3">
        <StatCard label="Active vendors" value={formatNumber(data?.length ?? 0)} icon={Truck} loading={isLoading} />
        <StatCard label="Total payable" value={formatINR(payable)} icon={Wallet} loading={isLoading} hint={`${data?.filter((v) => v.status === 'overdue').length ?? 0} overdue`} />
        <StatCard label="Purchased this year" value={formatINR(data?.reduce((s, v) => s + v.totalPurchased, 0) ?? 0)} icon={ShoppingBag} loading={isLoading} className="col-span-2 xl:col-span-1" />
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(v) => v.id}
        searchText={(v) => `${v.name} ${v.gstin} ${v.contact} ${v.city}`}
        searchPlaceholder="Search vendor, GSTIN or contact"
        onRowClick={(v) => navigate(`/vendors/${v.id}`)}
        filters={[
          { id: 'category', label: 'Categories', options: categories.map((c) => ({ value: c, label: c })), predicate: (v, val) => v.category === val },
          { id: 'status', label: 'Statuses', options: [{ value: 'active', label: 'Active' }, { value: 'overdue', label: 'Overdue' }], predicate: (v, val) => v.status === val },
        ]}
        rowActions={[{ label: 'View profile', icon: Eye, onSelect: (v) => navigate(`/vendors/${v.id}`) }, del.action]}
        empty={<EmptyState icon={Truck} title="No vendors yet." description="Add the suppliers you buy from to track purchases and payables." actionLabel="Add Vendor" onAction={() => setOpen(true)} />}
      />
      <PartyFormDrawer kind="vendor" open={open} onOpenChange={setOpen} />
      {del.dialog}
    </>
  );
}
