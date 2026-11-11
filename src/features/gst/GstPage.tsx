import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { ArrowDownLeft, ArrowUpRight, Download, FileCheck2, FileSpreadsheet, Info, Landmark, Receipt, ShieldCheck, Wallet } from 'lucide-react';
import { BarsChart, ChartLegend } from '@/components/charts/Charts';
import { ChartCard } from '@/components/charts/ChartCard';
import { useChartTheme } from '@/components/charts/useChartTheme';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import { downloadTextFile, toCsv } from '@/lib/utils';
import { gstService, type GstInvoiceRow } from '@/services';

const registerColumns: Column<GstInvoiceRow>[] = [
  { id: 'number', header: 'Invoice', hideable: false, sortValue: (r) => r.number, cell: (r) => <span className="font-semibold">{r.number}</span> },
  { id: 'party', header: 'Party', sortValue: (r) => r.party, cell: (r) => <div><p className="max-w-[180px] truncate">{r.party}</p><p className="font-mono text-2xs text-subtle">{r.gstin}</p></div> },
  { id: 'type', header: 'Type', cell: (r) => <Badge tone={r.type === 'B2B' ? 'primary' : 'neutral'}>{r.type}</Badge> },
  { id: 'date', header: 'Date', sortValue: (r) => r.date, cell: (r) => formatDate(r.date) },
  { id: 'taxable', header: 'Taxable', align: 'right', sortValue: (r) => r.taxable, cell: (r) => formatINR(r.taxable) },
  { id: 'cgst', header: 'CGST', align: 'right', cell: (r) => formatINR(r.cgst) },
  { id: 'sgst', header: 'SGST', align: 'right', cell: (r) => formatINR(r.sgst) },
  { id: 'igst', header: 'IGST', align: 'right', cell: (r) => (r.igst ? formatINR(r.igst) : <span className="text-subtle">—</span>) },
  { id: 'total', header: 'Invoice value', align: 'right', sortValue: (r) => r.total, cell: (r) => <span className="font-semibold">{formatINR(r.total)}</span> },
];

interface FilingData {
  gstin: string;
  businessName: string;
  period: string;
  output: number;
  input: number;
  liability: number;
  itc: number;
}

/** Exports real data for filing on the GST portal or sharing with a CA. Nothing is submitted from Sahaasra. */
function FilingPrep({ data, onExport }: { data: FilingData | null; onExport: (kind: 'sales' | 'purchases' | 'hsn') => void }) {
  const exportSummary = () => {
    if (!data) return;
    downloadTextFile(
      `sahaasra-gst-summary-${data.period.replace(/\s+/g, '-').toLowerCase()}.json`,
      JSON.stringify({ ...data, generatedAt: new Date().toISOString(), note: 'Prepared from your Sahaasra books. This is not a filed return.' }, null, 2),
      'application/json',
    );
  };
  return (
    <Card>
      <CardHeader title="Filing preparation" description={data ? `GSTR-1 & GSTR-3B · ${data.period}` : 'GSTR-1 & GSTR-3B'} icon={<FileCheck2 />} />
      <CardContent>
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-info-soft px-4 py-3 text-xs text-info">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Download your registers and summary, then file on the GST portal or share with your CA. Nothing is submitted from here.</p>
        </div>
        {!data?.gstin && <p className="mb-3 text-xs text-warning">Add your GSTIN in Settings → Business Profile so it appears on exports.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={() => onExport('sales')}><Download /> Sales register (GSTR-1)</Button>
          <Button variant="secondary" onClick={() => onExport('purchases')}><Download /> Purchase register (ITC)</Button>
          <Button variant="secondary" onClick={() => onExport('hsn')}><Download /> HSN summary</Button>
          <Button onClick={exportSummary} disabled={!data}><Download /> Tax summary (GSTR-3B)</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function GstPage() {
  const c = useChartTheme();
  const summary = useQuery({ queryKey: ['gst', 'summary'], queryFn: gstService.summary });
  const sales = useQuery({ queryKey: ['gst', 'sales'], queryFn: gstService.salesRegister });
  const purchases = useQuery({ queryKey: ['gst', 'purchases'], queryFn: gstService.purchaseRegister });
  const hsn = useQuery({ queryKey: ['gst', 'hsn'], queryFn: gstService.hsnSummary });
  const notes = useQuery({ queryKey: ['gst', 'notes'], queryFn: gstService.notes });
  const rates = useQuery({ queryKey: ['gst', 'rates'], queryFn: gstService.rateBreakdown });
  const s = summary.data;

  const exportRegister = (rows: GstInvoiceRow[] | undefined, name: string) => {
    downloadTextFile(`sahaasra-${name}.csv`, toCsv((rows ?? []).map((r) => ({ Invoice: r.number, Party: r.party, GSTIN: r.gstin, Date: formatDate(r.date), Taxable: r.taxable, CGST: r.cgst, SGST: r.sgst, IGST: r.igst, Total: r.total }))), 'text/csv');
    toast.success(`${name.replace('-', ' ')} exported`);
  };
  const exportHsn = () => {
    downloadTextFile('sahaasra-hsn-summary.csv', toCsv((hsn.data ?? []).map((r) => ({ HSN: r.hsn, Description: r.description, Quantity: r.qty, 'GST rate': r.rate, Taxable: r.taxable, Tax: r.tax }))), 'text/csv');
    toast.success('HSN summary exported');
  };
  const { gstin, businessName } = useWorkspace();
  const filing = s ? { gstin, businessName, period: s.period, output: s.output, input: s.input, liability: s.liability, itc: s.itc } : null;

  return (
    <>
      <PageHeader
        title="GST"
        description={`Your GST command center${s ? ` · ${s.period}` : ''}.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => exportRegister(sales.data, 'sales-register')}><FileSpreadsheet /> Export registers</Button>
            <Button onClick={() => document.getElementById('filing')?.scrollIntoView({ behavior: 'smooth' })}><FileCheck2 /> Prepare return</Button>
          </>
        }
      />

      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Output GST" value={s ? formatINR(s.output) : '—'} icon={ArrowUpRight} loading={summary.isLoading} hint="collected on sales" />
        <StatCard label="Input GST" value={s ? formatINR(s.input) : '—'} icon={ArrowDownLeft} loading={summary.isLoading} hint="paid on purchases" />
        <StatCard label="Net GST Liability" value={s ? formatINR(s.liability) : '—'} icon={Landmark} loading={summary.isLoading} hint="payable this period" accent />
        <StatCard label="ITC Available" value={s ? formatINR(s.itc) : '—'} icon={Wallet} loading={summary.isLoading} hint="carried forward" />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <ChartCard
          title="Tax Breakdown"
          description="Output vs input GST by rate slab"
          loading={rates.isLoading}
          height={260}
          className="xl:col-span-2"
          actions={<ChartLegend items={[{ label: 'Output', color: c.primary }, { label: 'Input', color: c.secondary }]} />}
        >
          <BarsChart data={rates.data ?? []} xKey="label" height={260} series={[{ key: 'value', label: 'Output' }, { key: 'value2', label: 'Input' }]} />
        </ChartCard>
        <Card>
          <CardHeader title="Return calendar" icon={<ShieldCheck />} />
          <CardContent className="space-y-2.5">
            {s?.returns.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary"><Receipt className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{r.label}</p>
                  <p className="truncate text-2xs text-muted-foreground">{r.description} · due {formatDate(r.due)}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales GST</TabsTrigger>
          <TabsTrigger value="purchases">Purchase GST</TabsTrigger>
          <TabsTrigger value="hsn">HSN Summary</TabsTrigger>
          <TabsTrigger value="credit">Credit Notes</TabsTrigger>
          <TabsTrigger value="debit">Debit Notes</TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <DataTable
            data={sales.data}
            isLoading={sales.isLoading}
            columns={registerColumns}
            getRowId={(r) => r.id}
            searchText={(r) => `${r.number} ${r.party} ${r.gstin}`}
            searchPlaceholder="Search invoices"
            filters={[{ id: 'type', label: 'Types', options: [{ value: 'B2B', label: 'B2B' }, { value: 'B2C', label: 'B2C' }], predicate: (r, v) => r.type === v }]}
            toolbar={<Button variant="secondary" onClick={() => exportRegister(sales.data, 'sales-register')}><Download /> CSV</Button>}
            empty={<EmptyState icon={Receipt} title="No sales invoices this period." description="Outward supplies will appear here as you bill." />}
          />
        </TabsContent>
        <TabsContent value="purchases">
          <DataTable
            data={purchases.data}
            isLoading={purchases.isLoading}
            columns={registerColumns}
            getRowId={(r) => r.id}
            searchText={(r) => `${r.number} ${r.party}`}
            searchPlaceholder="Search bills"
            toolbar={<Button variant="secondary" onClick={() => exportRegister(purchases.data, 'purchase-register')}><Download /> CSV</Button>}
            empty={<EmptyState icon={Receipt} title="No purchase bills this period." description="Inward supplies eligible for ITC will appear here." />}
          />
        </TabsContent>
        <TabsContent value="hsn">
          <DataTable
            data={hsn.data}
            isLoading={hsn.isLoading}
            getRowId={(r) => r.hsn}
            searchText={(r) => `${r.hsn} ${r.description}`}
            searchPlaceholder="Search HSN"
            columns={[
              { id: 'hsn', header: 'HSN', hideable: false, cell: (r) => <span className="font-mono font-semibold">{r.hsn}</span> },
              { id: 'desc', header: 'Description', cell: (r) => r.description },
              { id: 'qty', header: 'Quantity', align: 'right', sortValue: (r) => r.qty, cell: (r) => formatNumber(r.qty) },
              { id: 'rate', header: 'Rate', align: 'right', cell: (r) => `${r.rate}%` },
              { id: 'taxable', header: 'Taxable value', align: 'right', sortValue: (r) => r.taxable, cell: (r) => formatINR(r.taxable) },
              { id: 'tax', header: 'Tax', align: 'right', sortValue: (r) => r.tax, cell: (r) => <span className="font-semibold">{formatINR(r.tax)}</span> },
            ]}
            empty={<EmptyState icon={Receipt} title="No HSN data yet." description="HSN-wise summary builds automatically from your invoices." />}
          />
        </TabsContent>
        {(['credit', 'debit'] as const).map((kind) => (
          <TabsContent key={kind} value={kind}>
            <DataTable
              data={notes.data?.[kind]}
              isLoading={notes.isLoading}
              getRowId={(n) => n.id}
              columns={[
                { id: 'num', header: kind === 'credit' ? 'Credit note' : 'Debit note', hideable: false, cell: (n) => <span className="font-semibold">{n.number}</span> },
                { id: 'party', header: 'Party', cell: (n) => n.party },
                { id: 'against', header: 'Against', cell: (n) => n.against },
                { id: 'date', header: 'Date', cell: (n) => formatDate(n.date) },
                { id: 'reason', header: 'Reason', cell: (n) => <span className="text-muted-foreground">{n.reason}</span> },
                { id: 'taxable', header: 'Taxable', align: 'right', cell: (n) => formatINR(n.taxable) },
                { id: 'tax', header: 'GST', align: 'right', cell: (n) => formatINR(n.tax) },
              ]}
              empty={<EmptyState icon={Receipt} title={`No ${kind} notes.`} description={`${kind === 'credit' ? 'Sales returns and post-sale discounts' : 'Purchase returns'} create ${kind} notes automatically.`} />}
            />
          </TabsContent>
        ))}
      </Tabs>

      <div id="filing" className="mt-6 scroll-mt-24">
        <FilingPrep data={filing} onExport={(k) => (k === 'hsn' ? exportHsn() : k === 'sales' ? exportRegister(sales.data, 'sales-register') : exportRegister(purchases.data, 'purchase-register'))} />
      </div>
    </>
  );
}
