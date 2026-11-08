import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { AlertCircle, ArrowDownRight, ArrowUpRight, PackageMinus, ReceiptText, Trophy, Truck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { Avatar } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { qk } from '@/hooks/queries';
import { formatDate, formatINR, formatNumber, formatPercent, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dashboardService } from '@/services';
import { PAYMENT_LABELS } from '@/features/sales/salesMeta';
import { ListSkeleton, WidgetCard } from './WidgetCard';

export function TopProductsWidget() {
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard('top-products'), queryFn: dashboardService.topProducts });
  return (
    <WidgetCard title="Top Products" description="By revenue this week" icon={<Trophy />} link={{ to: '/reports' }}>
      {isLoading || !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState compact icon={Trophy} title="No sales this week" description="Your best-selling products will appear here once you start billing." />
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wider text-subtle">
              <th className="pb-2 font-semibold">Product</th>
              <th className="hidden pb-2 text-right font-semibold sm:table-cell">Units Sold</th>
              <th className="pb-2 text-right font-semibold">Revenue</th>
              <th className="pb-2 text-right font-semibold">Trend</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-2.5 pr-2">
                  <div className="flex items-center gap-3">
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold', i === 0 ? 'bg-primary text-white' : 'bg-primary-light text-primary')}>
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="max-w-[200px] truncate font-medium">{p.name}</p>
                      <p className="text-2xs text-subtle">{p.category}</p>
                    </div>
                  </div>
                </td>
                <td className="tabular hidden py-2.5 text-right text-muted-foreground sm:table-cell">{formatNumber(p.units)}</td>
                <td className="tabular py-2.5 text-right font-semibold">{formatINR(p.revenue)}</td>
                <td className="py-2.5 text-right">
                  {p.trend === undefined ? (
                    <span className="text-xs text-subtle">New</span>
                  ) : (
                    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', p.trend >= 0 ? 'text-success' : 'text-danger')}>
                      {p.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {formatPercent(p.trend)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WidgetCard>
  );
}

export function TransactionsWidget() {
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard('transactions'), queryFn: dashboardService.recentTransactions });
  return (
    <WidgetCard title="Recent Transactions" description="Latest invoices across branches" icon={<ReceiptText />} link={{ to: '/sales' }} bodyClassName="px-0 pb-2">
      {isLoading || !data ? (
        <div className="px-5">
          <ListSkeleton />
        </div>
      ) : data.length === 0 ? (
        <EmptyState compact icon={ReceiptText} title="No transactions yet" description="Invoices created from POS will appear here instantly." />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-y border-border bg-surface/60 text-left text-2xs uppercase tracking-wider text-subtle">
                  {['Invoice', 'Customer', 'Date', 'Amount', 'Payment', 'Status'].map((h) => (
                    <th key={h} className={cn('px-4 py-2.5 font-semibold first:pl-5', h === 'Amount' && 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className="border-b border-border transition-colors last:border-0 hover:bg-primary-soft/60">
                    <td className="whitespace-nowrap px-4 py-3 pl-5">
                      <Link to={`/sales?invoice=${s.invoiceNo}`} className="font-semibold text-primary hover:underline">{s.invoiceNo}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={s.customerName} size="xs" />
                        <span className="max-w-[160px] truncate">{s.customerName}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(s.date)} · {formatTime(s.date)}</td>
                    <td className="tabular px-4 py-3 text-right font-semibold">{formatINR(s.total)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{PAYMENT_LABELS[s.payment]}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border md:hidden">
            {data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-primary">{s.invoiceNo}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.customerName} · {PAYMENT_LABELS[s.payment]}</p>
                </div>
                <div className="text-right">
                  <p className="tabular text-[13px] font-semibold">{formatINR(s.total)}</p>
                  <StatusBadge status={s.status} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetCard>
  );
}

export function LowStockWidget() {
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard('low-stock'), queryFn: dashboardService.lowStock });
  return (
    <WidgetCard title="Low Stock" description="Below minimum level" icon={<PackageMinus />} link={{ to: '/inventory' }}>
      {isLoading || !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState compact icon={PackageMinus} title="Stock levels look healthy" description="No products are below their minimum stock." />
      ) : (
        <ul className="space-y-3.5">
          {data.map((p) => (
            <li key={p.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{p.name}</p>
                  <p className="text-2xs text-subtle">
                    <span className="tabular font-semibold text-foreground">{p.stock}</span> in stock · min {p.minStock}
                  </p>
                </div>
                <StatusBadge status={p.stock === 0 ? 'Out of stock' : 'Low stock'} />
              </div>
              <Progress className="mt-2" value={p.stock} max={p.minStock} tone={p.stock === 0 ? 'danger' : 'warning'} label={`${p.name} stock level`} />
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

function DueRow({ name, amount, due, href }: { name: string; amount: number; due?: string; href: string }) {
  const days = due ? differenceInCalendarDays(parseISO(due), new Date()) : 0;
  const overdue = days < 0;
  return (
    <li>
      <Link to={href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{name}</p>
          <p className={cn('text-2xs', overdue ? 'text-danger' : 'text-subtle')}>
            {due ? (overdue ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : `Due ${formatDate(due)}`) : 'No due date'}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular text-[13px] font-semibold">{formatINR(amount)}</p>
          <StatusBadge status={overdue ? 'overdue' : 'pending'} />
        </div>
      </Link>
    </li>
  );
}

export function CustomerDuesWidget() {
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard('customer-dues'), queryFn: dashboardService.customerDues });
  const total = data?.reduce((s, c) => s + c.outstanding, 0) ?? 0;
  return (
    <WidgetCard title="Customer Dues" description={data ? `${formatINR(total)} to collect` : 'Receivables'} icon={<Users />} link={{ to: '/customers' }}>
      {isLoading || !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState compact icon={AlertCircle} title="No pending dues" description="Every customer is fully paid up." />
      ) : (
        <ul className="space-y-0.5">
          {data.map((c) => (
            <DueRow key={c.id} name={c.name} amount={c.outstanding} due={c.dueDate} href={`/customers/${c.id}`} />
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export function VendorDuesWidget() {
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard('vendor-dues'), queryFn: dashboardService.vendorDues });
  const total = data?.reduce((s, v) => s + v.payable, 0) ?? 0;
  return (
    <WidgetCard title="Vendor Dues" description={data ? `${formatINR(total)} payable` : 'Payables'} icon={<Truck />} link={{ to: '/vendors' }}>
      {isLoading || !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState compact icon={Truck} title="No vendor dues" description="Nothing is payable to vendors right now." />
      ) : (
        <ul className="space-y-0.5">
          {data.map((v) => (
            <DueRow key={v.id} name={v.name} amount={v.payable} due={v.dueDate} href={`/vendors/${v.id}`} />
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
