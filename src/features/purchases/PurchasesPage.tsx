import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Eye, PackageCheck, Plus, ShoppingBag, Truck, Undo2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DetailList } from '@/components/common/DetailList';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { qk, useAppMutation, useProducts, usePurchases } from '@/hooks/queries';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { formatDate, formatINR } from '@/lib/format';
import { purchasesService } from '@/services';
import type { Purchase } from '@/types';
import { returnColumns } from '@/features/sales/SalesPage';
import { collectSerials, PurchaseSerials, serialNeeds } from './PurchaseSerials';

export function PurchasesPage() {
  const navigate = useNavigate();
  const { data, isLoading } = usePurchases();
  const returns = useQuery({ queryKey: qk.purchaseReturns, queryFn: purchasesService.returns });
  const { data: products } = useProducts();
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [serialText, setSerialText] = useState<Record<string, string>>({});
  const pending = (p: Purchase) => p.status !== 'received' && p.status !== 'returned';
  const needs = viewing && pending(viewing) ? serialNeeds(viewing.items, products) : [];
  const receive = useAppMutation(
    (p: Purchase) => {
      const n = serialNeeds(p.items, products);
      return purchasesService.receive(p.id, n.length ? collectSerials(n, serialText) : {});
    },
    {
      invalidate: [qk.purchases, qk.products, qk.vendors, qk.inventory, ['dashboard']],
      success: (p) => `Goods received against ${p.billNo}`,
      onSuccess: (p) => {
        setSerialText({});
        setViewing(p);
      },
    },
  );
  const del = useDeleteAction<Purchase>({
    page: 'purchases',
    name: (p) => `bill ${p.billNo}`,
    remove: (p) => purchasesService.remove(p.id),
    invalidate: [qk.purchases, qk.products, qk.vendors, qk.inventory, ['dashboard']],
    hidden: (p) => p.status === 'returned' || p.status === 'partial',
    description: (p) => (p.status === 'received' ? `Its ${p.items.length} item${p.items.length === 1 ? '' : 's'} will be taken back out of stock and ${formatINR(p.total)} removed from what you owe ${p.vendorName}.` : `Order from ${p.vendorName} for ${formatINR(p.total)}.`),
    onDeleted: () => setViewing(null),
  });
  // Bills with IMEI-tracked items open first so the numbers can be entered.
  const startReceive = (p: Purchase) => {
    if (serialNeeds(p.items, products).length) {
      setSerialText({});
      setViewing(p);
    } else receive.mutate(p);
  };

  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.reduce((s, p) => s + p.total, 0),
      unpaid: list.reduce((s, p) => s + (p.total - p.paid), 0),
      pending: list.filter((p) => p.status === 'ordered' || p.status === 'partial').length,
    };
  }, [data]);

  const columns: Column<Purchase>[] = [
    { id: 'bill', header: 'Bill no.', hideable: false, sortValue: (p) => p.billNo, cell: (p) => <span className="font-semibold">{p.billNo}</span> },
    {
      id: 'vendor',
      header: 'Vendor',
      sortValue: (p) => p.vendorName,
      cell: (p) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={p.vendorName} size="xs" />
          <span className="max-w-[200px] truncate">{p.vendorName}</span>
        </div>
      ),
    },
    { id: 'date', header: 'Date', sortValue: (p) => p.date, cell: (p) => <span className="text-muted-foreground">{formatDate(p.date)}</span> },
    { id: 'items', header: 'Items', align: 'right', cell: (p) => p.items.length },
    { id: 'tax', header: 'GST', align: 'right', defaultHidden: true, cell: (p) => formatINR(p.tax) },
    { id: 'total', header: 'Total', align: 'right', sortValue: (p) => p.total, cell: (p) => <span className="font-semibold">{formatINR(p.total)}</span> },
    { id: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
    { id: 'payment', header: 'Payment', cell: (p) => <StatusBadge status={p.paymentStatus} /> },
  ];

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Stock purchases, vendor bills and purchase returns."
        actions={<Button asChild><Link to="/purchases/new"><Plus /> New Purchase</Link></Button>}
      />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Purchases (60 days)" value={formatINR(stats.total)} icon={ShoppingBag} loading={isLoading} />
        <StatCard label="Unpaid bills" value={formatINR(stats.unpaid)} icon={Wallet} loading={isLoading} />
        <StatCard label="Awaiting delivery" value={stats.pending} icon={Truck} loading={isLoading} hint="ordered / partial" />
        <StatCard label="Returns" value={returns.data?.length ?? 0} icon={Undo2} loading={returns.isLoading} hint="debit notes" />
      </div>

      <Tabs defaultValue="bills">
        <TabsList>
          <TabsTrigger value="bills">Purchase bills</TabsTrigger>
          <TabsTrigger value="returns">Purchase returns</TabsTrigger>
        </TabsList>
        <TabsContent value="bills">
          <DataTable
            data={data}
            isLoading={isLoading}
            columns={columns}
            getRowId={(p) => p.id}
            searchText={(p) => `${p.billNo} ${p.vendorName}`}
            searchPlaceholder="Search bill or vendor"
            onRowClick={setViewing}
            filters={[
              { id: 'status', label: 'Statuses', options: ['received', 'ordered', 'partial', 'returned'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), predicate: (p, v) => p.status === v },
              { id: 'payment', label: 'Payments', options: ['paid', 'partial', 'unpaid'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), predicate: (p, v) => p.paymentStatus === v },
            ]}
            rowActions={[
              { label: 'View', icon: Eye, onSelect: setViewing },
              { label: 'Mark as received', icon: PackageCheck, onSelect: startReceive, hidden: (p) => !pending(p) },
              del.action,
            ]}
            empty={<EmptyState icon={ClipboardList} title="No purchases yet." description="Record your first vendor bill to update stock and track payables." actionLabel="New Purchase" onAction={() => navigate('/purchases/new')} />}
          />
        </TabsContent>
        <TabsContent value="returns">
          <DataTable
            data={returns.data}
            isLoading={returns.isLoading}
            columns={returnColumns('Vendor')}
            getRowId={(r) => r.id}
            searchText={(r) => `${r.ref} ${r.party}`}
            empty={<EmptyState icon={Undo2} title="No purchase returns." description="Goods returned to vendors will appear here with their debit notes." />}
          />
        </TabsContent>
      </Tabs>

      <Drawer
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        width="lg"
        title={viewing ? `Purchase ${viewing.billNo}` : ''}
        description={viewing?.vendorName}
        footer={viewing && pending(viewing) && (
          <Button onClick={() => receive.mutate(viewing)} loading={receive.isPending}><PackageCheck /> Mark as received</Button>
        )}
      >
        {viewing && (
          <div className="space-y-6">
            <DetailList
              items={[
                ['Date', formatDate(viewing.date)],
                ['Status', <StatusBadge key="s" status={viewing.status} />],
                ['Payment', <StatusBadge key="p" status={viewing.paymentStatus} />],
                ['Paid', formatINR(viewing.paid)],
              ]}
            />
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-2xs uppercase tracking-wider text-subtle">
                  <th className="pb-2 font-semibold">Item</th>
                  <th className="pb-2 text-right font-semibold">Qty</th>
                  <th className="pb-2 text-right font-semibold">Rate</th>
                  <th className="pb-2 text-right font-semibold">GST</th>
                  <th className="pb-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {viewing.items.map((i) => (
                  <tr key={i.id} className="border-b border-border">
                    <td className="py-2 pr-2">{i.name}</td>
                    <td className="tabular py-2 text-right">{i.qty}</td>
                    <td className="tabular py-2 text-right">{formatINR(i.rate)}</td>
                    <td className="tabular py-2 text-right">{i.gstRate}%</td>
                    <td className="tabular py-2 text-right font-medium">{formatINR(i.qty * i.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto w-60 space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular">{formatINR(viewing.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">GST</dt><dd className="tabular">{formatINR(viewing.tax)}</dd></div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><dt>Total</dt><dd className="tabular text-primary">{formatINR(viewing.total)}</dd></div>
            </dl>
            {needs.length > 0 && (
              <section className="space-y-3 border-t border-border pt-5">
                <p className="text-[13px] font-medium">Enter the IMEI / serial numbers of the pieces received</p>
                <PurchaseSerials needs={needs} value={serialText} onChange={setSerialText} />
              </section>
            )}
          </div>
        )}
      </Drawer>
      {del.dialog}
    </>
  );
}
