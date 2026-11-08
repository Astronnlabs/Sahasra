import { CalendarDays, Building2, LayoutPanelTop } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DATE_RANGES, useWorkspace, type DateRangeKey } from '@/app/providers/WorkspaceProvider';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/app/providers/AuthProvider';
import { BRANCHES } from '@/app/config/constants';
import { cn } from '@/lib/utils';
import { DashboardCustomizer } from './DashboardCustomizer';
import { useDashboardLayout, WIDGETS, type WidgetId } from './useDashboardLayout';
import { AttendanceWidget, ExpenseBreakdownWidget, GstSummaryWidget } from './widgets/ExtraWidgets';
import { HealthWidget } from './widgets/HealthWidget';
import { InsightsWidget } from './widgets/InsightsWidget';
import { KpiWidget } from './widgets/KpiWidget';
import { CustomerDuesWidget, LowStockWidget, TopProductsWidget, TransactionsWidget, VendorDuesWidget } from './widgets/ListWidgets';
import { SalesChartWidget } from './widgets/SalesChartWidget';

const SPAN = Object.fromEntries(WIDGETS.map((w) => [w.id, w.span])) as Record<WidgetId, string>;
const BRANCH_OPTIONS = [{ value: 'all', label: 'All Branches' }, ...BRANCHES.map((b) => ({ value: b.id, label: b.name }))];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const { user } = useAuth();
  const { branch, dateRange, update } = useWorkspace();
  const layout = useDashboardLayout();
  const [customizing, setCustomizing] = useState(false);

  const render = (id: WidgetId): ReactNode => {
    switch (id) {
      case 'kpi-sales':
        return <KpiWidget id="sales" range={dateRange} branch={branch} />;
      case 'kpi-collection':
        return <KpiWidget id="collection" range={dateRange} branch={branch} />;
      case 'kpi-expenses':
        return <KpiWidget id="expenses" range={dateRange} branch={branch} />;
      case 'kpi-profit':
        return <KpiWidget id="profit" range={dateRange} branch={branch} />;
      case 'sales-chart':
        return <SalesChartWidget />;
      case 'health':
        return <HealthWidget />;
      case 'top-products':
        return <TopProductsWidget />;
      case 'insights':
        return <InsightsWidget />;
      case 'transactions':
        return <TransactionsWidget />;
      case 'low-stock':
        return <LowStockWidget />;
      case 'customer-dues':
        return <CustomerDuesWidget />;
      case 'vendor-dues':
        return <VendorDuesWidget />;
      case 'gst-summary':
        return <GstSummaryWidget />;
      case 'attendance':
        return <AttendanceWidget />;
      case 'expense-breakdown':
        return <ExpenseBreakdownWidget />;
    }
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <>
            {greeting()}, {user?.name.split(' ')[0] ?? 'there'}. Here&apos;s what&apos;s happening with your business today.
          </>
        }
        actions={
          <>
            <Select value={branch} onValueChange={(v) => update({ branch: v })} options={BRANCH_OPTIONS} icon={<Building2 />} ariaLabel="Branch" />
            <Select value={dateRange} onValueChange={(v) => update({ dateRange: v as DateRangeKey })} options={DATE_RANGES} icon={<CalendarDays />} ariaLabel="Date range" />
            <Button variant="soft" onClick={() => setCustomizing(true)}>
              <LayoutPanelTop /> Customize Dashboard
            </Button>
          </>
        }
      />

      {layout.visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={LayoutPanelTop}
            title="Your dashboard is empty"
            description="All widgets are hidden. Add the ones you care about back to your dashboard."
            actionLabel="Add widgets"
            onAction={() => setCustomizing(true)}
          />
        </Card>
      ) : (
        <div className="stagger grid grid-flow-row-dense grid-cols-1 gap-4 sm:grid-cols-12 lg:gap-5">
          {layout.visible.map((id) => (
            <section key={id} aria-label={WIDGETS.find((w) => w.id === id)?.label} className={cn('col-span-1 sm:col-span-12', SPAN[id])}>
              {render(id)}
            </section>
          ))}
        </div>
      )}

      <DashboardCustomizer
        open={customizing}
        onOpenChange={setCustomizing}
        order={layout.order}
        hidden={layout.hidden}
        toggle={layout.toggle}
        move={layout.move}
        reset={layout.reset}
      />
    </>
  );
}
