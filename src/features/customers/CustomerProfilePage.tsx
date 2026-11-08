import { useQuery } from '@tanstack/react-query';
import { Calendar, FileText, HandCoins, Mail, MapPin, MessageCircle, Phone, Plus, ReceiptText, ShoppingBag, StickyNote, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProfileHeader } from '@/components/common/ProfileHeader';
import { Timeline } from '@/components/common/Timeline';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { BarsChart } from '@/components/charts/Charts';
import { qk, useAppMutation } from '@/hooks/queries';
import { openWhatsApp } from '@/lib/share';
import { formatDate, formatDateTime, formatINR, timeAgo } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { customersService } from '@/services';
import { PAYMENT_LABELS } from '@/features/sales/salesMeta';
import type { Sale } from '@/types';
import { RecordPaymentModal } from './RecordPaymentModal';

const invoiceColumns: Column<Sale>[] = [
  { id: 'inv', header: 'Invoice', hideable: false, sortValue: (s) => s.invoiceNo, cell: (s) => <Link to={`/sales?invoice=${s.invoiceNo}`} className="font-semibold text-primary hover:underline">{s.invoiceNo}</Link> },
  { id: 'date', header: 'Date', sortValue: (s) => s.date, cell: (s) => formatDate(s.date) },
  { id: 'items', header: 'Items', align: 'right', cell: (s) => s.items.reduce((n, i) => n + i.qty, 0) },
  { id: 'amount', header: 'Amount', align: 'right', sortValue: (s) => s.total, cell: (s) => <span className="font-semibold">{formatINR(s.total)}</span> },
  { id: 'payment', header: 'Payment', cell: (s) => PAYMENT_LABELS[s.payment] },
  { id: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
];

export function CustomerProfilePage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useQuery({ queryKey: qk.customer(id), queryFn: () => customersService.profile(id) });
  const [draft, setDraft] = useState('');
  const [paying, setPaying] = useState(false);
  const { businessName } = useWorkspace();
  const addNote = useAppMutation((text: string) => customersService.addNote(id, text), {
    invalidate: [qk.customer(id)],
    success: 'Note added',
    onSuccess: () => setDraft(''),
  });
  const remind = () => {
    const cust = data?.customer;
    if (!cust) return;
    openWhatsApp(
      cust.phone,
      `Hello ${cust.name}, this is a friendly reminder from ${businessName}. Your pending balance is ${formatINR(cust.outstanding)}${cust.dueDate ? `, due on ${formatDate(cust.dueDate)}` : ''}. Thank you!`,
    );
  };

  const allNotes = data?.notes ?? [];
  const purchaseHistory = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; amount: number; last: string }>();
    data?.invoices.forEach((s) =>
      s.items.forEach((it) => {
        const row = map.get(it.name) ?? { name: it.name, qty: 0, amount: 0, last: s.date };
        row.qty += it.qty;
        row.amount += it.qty * it.rate - it.discount;
        if (s.date > row.last) row.last = s.date;
        map.set(it.name, row);
      }),
    );
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [data]);

  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    data?.invoices
      .slice()
      .reverse()
      .forEach((s) => {
        const k = formatDate(s.date).slice(3);
        map.set(k, (map.get(k) ?? 0) + s.total);
      });
    return Array.from(map, ([label, value]) => ({ label, value }));
  }, [data]);

  if (isError) {
    return (
      <Card>
        <EmptyState icon={UserX} title="Customer not found" description="This customer may have been removed or the link is incorrect." secondary={<Button asChild variant="secondary"><Link to="/customers">Back to customers</Link></Button>} />
      </Card>
    );
  }

  const c = data?.customer;
  const unpaid = data?.invoices.filter((s) => s.paid < s.total && s.status !== 'refunded') ?? [];

  return (
    <>
      <PageHeader title="Customer profile" back={{ to: '/customers', label: 'Customers' }} className="mb-4" />
      <ProfileHeader
        loading={isLoading}
        name={c?.name}
        subtitle={c ? `Customer since ${formatDate(c.createdAt)}` : undefined}
        badges={c && (<><StatusBadge status={c.status} />{c.tags.map((t) => <Badge key={t} tone="primary">{t}</Badge>)}</>)}
        meta={c && [
          { icon: <Phone />, label: c.phone },
          { icon: <Mail />, label: c.email },
          { icon: <MapPin />, label: c.city },
          ...(c.gstin ? [{ icon: <FileText />, label: `GSTIN ${c.gstin}` }] : []),
        ]}
        actions={c && (
          <>
            <Button variant="secondary" onClick={() => openWhatsApp(c.phone, `Hello ${c.name}, ` )}><MessageCircle /> Message</Button>
            {c.outstanding > 0 && <Button variant="secondary" onClick={() => setPaying(true)}><HandCoins /> Record payment</Button>}
            <Button asChild><Link to="/pos"><Plus /> New sale</Link></Button>
          </>
        )}
        stats={c && [
          { label: 'Total spend', value: formatINR(c.totalSpend) },
          { label: 'Orders', value: c.orders },
          { label: 'Avg. order', value: formatINR(Math.round(c.totalSpend / Math.max(1, c.orders))) },
          { label: 'Outstanding', value: formatINR(c.outstanding), tone: c.outstanding ? 'text-danger' : 'text-success' },
        ]}
      />

      {data && c && (
        <Tabs defaultValue="overview" className="mt-6">
          <TabsList variant="underline">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
            <TabsTrigger value="history">Purchase history</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-5 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader title="Spending trend" description="Invoice value by month" />
                <CardContent>
                  {monthly.length ? <BarsChart data={monthly} xKey="label" series={[{ key: 'value', label: 'Spend' }]} height={240} /> : <p className="py-16 text-center text-[13px] text-muted-foreground">No invoices yet.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader title="Recent activity" />
                <CardContent>
                  <Timeline items={data.activity.slice(0, 4).map((a) => ({ id: a.id, title: a.label, time: timeAgo(a.at) }))} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="transactions">
            <DataTable bare data={data.invoices} columns={invoiceColumns} getRowId={(s) => s.id} pageSize={8} empty={<EmptyState icon={ReceiptText} title="No transactions yet." description="Invoices for this customer will appear here." />} />
          </TabsContent>

          <TabsContent value="payments">
            <DataTable
              bare
              data={data.payments}
              getRowId={(p) => p.id}
              pageSize={8}
              columns={[
                { id: 'date', header: 'Date', cell: (p) => formatDateTime(p.date) },
                { id: 'ref', header: 'Against', cell: (p) => <span className="font-medium">{p.reference}</span> },
                { id: 'method', header: 'Method', cell: (p) => PAYMENT_LABELS[p.method] },
                { id: 'amount', header: 'Amount', align: 'right', cell: (p) => <span className="font-semibold text-success">{formatINR(p.amount)}</span> },
              ]}
              empty={<EmptyState icon={HandCoins} title="No payments recorded." description="Payments received from this customer will show here." />}
            />
          </TabsContent>

          <TabsContent value="outstanding">
            {unpaid.length === 0 && c.outstanding === 0 ? (
              <Card><EmptyState icon={HandCoins} title="All settled" description={`${c.name} has no outstanding balance.`} /></Card>
            ) : (
              <div className="space-y-4">
                <Card className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Total outstanding</p>
                    <p className="tabular text-2xl font-semibold text-danger">{formatINR(c.outstanding)}</p>
                    {c.dueDate && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" /> Due {formatDate(c.dueDate)}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={remind}><MessageCircle /> Send reminder</Button>
                    <Button onClick={() => setPaying(true)}><HandCoins /> Record payment</Button>
                  </div>
                </Card>
                <DataTable bare data={unpaid} columns={invoiceColumns} getRowId={(s) => s.id} empty={null} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <DataTable
              bare
              data={purchaseHistory}
              getRowId={(r) => r.name}
              pageSize={10}
              columns={[
                { id: 'name', header: 'Product', cell: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
                { id: 'qty', header: 'Quantity', align: 'right', sortValue: (r) => r.qty, cell: (r) => r.qty },
                { id: 'amount', header: 'Amount', align: 'right', sortValue: (r) => r.amount, cell: (r) => formatINR(r.amount) },
                { id: 'last', header: 'Last bought', sortValue: (r) => r.last, cell: (r) => formatDate(r.last) },
              ]}
              empty={<EmptyState icon={ShoppingBag} title="No purchase history." description="Products bought by this customer will be summarised here." />}
            />
          </TabsContent>

          <TabsContent value="notes">
            <Card className="p-5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = sanitizeText(draft, 500);
                  if (text) addNote.mutate(text);
                }}
                className="space-y-2"
              >
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a private note about this customer…" maxLength={500} aria-label="New note" />
                <div className="flex justify-end">
                  <Button type="submit" disabled={!draft.trim()} loading={addNote.isPending}><StickyNote /> Add note</Button>
                </div>
              </form>
              <ul className="mt-5 space-y-3">
                {allNotes.map((n) => (
                  <li key={n.id} className="rounded-xl border border-border bg-surface/40 p-4">
                    <p className="whitespace-pre-wrap text-[13px]">{n.text}</p>
                    <p className="mt-2 text-2xs text-subtle">{n.author} · {timeAgo(n.at)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card className="p-6">
              <Timeline items={data.activity.map((a) => ({ id: a.id, title: a.label, time: formatDateTime(a.at) }))} />
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {c && <RecordPaymentModal open={paying} onOpenChange={setPaying} party={c.name} outstanding={c.outstanding} customerId={c.id} />}
    </>
  );
}
