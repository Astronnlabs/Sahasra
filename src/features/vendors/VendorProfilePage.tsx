import { useQuery } from '@tanstack/react-query';
import { HandCoins, Mail, MapPin, Package, Phone, Plus, ShoppingBag, Truck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProfileHeader } from '@/components/common/ProfileHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { qk } from '@/hooks/queries';
import { formatDate, formatINR } from '@/lib/format';
import { vendorsService } from '@/services';
import { PAYMENT_LABELS } from '@/features/sales/salesMeta';
import { RecordPaymentModal } from '@/features/customers/RecordPaymentModal';

export function VendorProfilePage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useQuery({ queryKey: qk.vendor(id), queryFn: () => vendorsService.profile(id) });
  const [paying, setPaying] = useState(false);

  if (isError) {
    return <Card><EmptyState icon={Truck} title="Vendor not found" description="This vendor may have been removed." secondary={<Button asChild variant="secondary"><Link to="/vendors">Back to vendors</Link></Button>} /></Card>;
  }
  const v = data?.vendor;

  return (
    <>
      <PageHeader title="Vendor profile" back={{ to: '/vendors', label: 'Vendors' }} className="mb-4" />
      <ProfileHeader
        loading={isLoading}
        name={v?.name}
        subtitle={v ? `${v.category} supplier · GSTIN ${v.gstin}` : undefined}
        badges={v && <StatusBadge status={v.status} />}
        meta={v && [
          { icon: <UserRound />, label: v.contact },
          { icon: <Phone />, label: v.phone },
          { icon: <Mail />, label: v.email },
          { icon: <MapPin />, label: v.city },
        ]}
        actions={v && (
          <>
            {v.payable > 0 && <Button variant="secondary" onClick={() => setPaying(true)}><HandCoins /> Pay vendor</Button>}
            <Button asChild><Link to="/purchases/new"><Plus /> New purchase</Link></Button>
          </>
        )}
        stats={v && [
          { label: 'Total purchased', value: formatINR(v.totalPurchased) },
          { label: 'Bills', value: v.purchases },
          { label: 'Payable', value: formatINR(v.payable), tone: v.payable ? 'text-danger' : 'text-success' },
          { label: 'Last purchase', value: formatDate(v.lastPurchase) },
        ]}
      />

      {data && v && (
        <Tabs defaultValue="purchases" className="mt-6">
          <TabsList variant="underline">
            <TabsTrigger value="purchases">Purchase history</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
          </TabsList>

          <TabsContent value="purchases">
            <DataTable
              bare
              data={data.bills}
              getRowId={(b) => b.id}
              pageSize={8}
              columns={[
                { id: 'bill', header: 'Bill no.', cell: (b) => <span className="font-semibold">{b.billNo}</span> },
                { id: 'date', header: 'Date', sortValue: (b) => b.date, cell: (b) => formatDate(b.date) },
                { id: 'items', header: 'Items', align: 'right', cell: (b) => b.items.length },
                { id: 'total', header: 'Total', align: 'right', sortValue: (b) => b.total, cell: (b) => <span className="font-semibold">{formatINR(b.total)}</span> },
                { id: 'status', header: 'Status', cell: (b) => <StatusBadge status={b.status} /> },
                { id: 'payment', header: 'Payment', cell: (b) => <StatusBadge status={b.paymentStatus} /> },
              ]}
              empty={<EmptyState icon={ShoppingBag} title="No purchases yet." description="Purchase bills from this vendor will appear here." />}
            />
          </TabsContent>

          <TabsContent value="payments">
            <DataTable
              bare
              data={data.payments}
              getRowId={(p) => p.id}
              columns={[
                { id: 'date', header: 'Date', cell: (p) => formatDate(p.date) },
                { id: 'ref', header: 'Against bill', cell: (p) => p.reference },
                { id: 'method', header: 'Method', cell: (p) => PAYMENT_LABELS[p.method] },
                { id: 'amount', header: 'Amount', align: 'right', cell: (p) => <span className="font-semibold">{formatINR(p.amount)}</span> },
              ]}
              empty={<EmptyState icon={HandCoins} title="No payments yet." description="Payments made to this vendor will appear here." />}
            />
          </TabsContent>

          <TabsContent value="outstanding">
            <Card className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs text-muted-foreground">Amount payable</p>
                <p className={`tabular text-2xl font-semibold ${v.payable ? 'text-danger' : 'text-success'}`}>{formatINR(v.payable)}</p>
                {v.dueDate && <p className="text-xs text-muted-foreground">Due {formatDate(v.dueDate)}</p>}
              </div>
              <Button onClick={() => setPaying(true)} disabled={!v.payable}><HandCoins /> Record payment</Button>
            </Card>
            <div className="mt-4">
              <DataTable
                bare
                data={data.bills.filter((b) => b.paymentStatus !== 'paid')}
                getRowId={(b) => b.id}
                columns={[
                  { id: 'bill', header: 'Bill no.', cell: (b) => <span className="font-semibold">{b.billNo}</span> },
                  { id: 'date', header: 'Date', cell: (b) => formatDate(b.date) },
                  { id: 'due', header: 'Balance', align: 'right', cell: (b) => <span className="font-semibold text-danger">{formatINR(b.total - b.paid)}</span> },
                  { id: 'status', header: 'Status', cell: (b) => <StatusBadge status={b.paymentStatus} /> },
                ]}
                empty={<EmptyState compact icon={HandCoins} title="Nothing pending" description="All bills from this vendor are paid." />}
              />
            </div>
          </TabsContent>

          <TabsContent value="products">
            {data.productNames.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {data.productNames.map((n) => (
                  <Card key={n} className="flex items-center gap-3 p-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary"><Package className="h-4 w-4" /></span>
                    <span className="text-[13px] font-medium">{n}</span>
                  </Card>
                ))}
              </div>
            ) : (
              <Card><EmptyState icon={Package} title="No products linked." description="Products you buy from this vendor appear here." /></Card>
            )}
          </TabsContent>

        </Tabs>
      )}

      {v && <RecordPaymentModal open={paying} onOpenChange={setPaying} party={v.name} outstanding={v.payable} vendorId={v.id} />}
    </>
  );
}
