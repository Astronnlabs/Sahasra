import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2, Gift, MessageCircle, Phone, PhoneCall, UserPlus, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUSINESS_TYPE_MAP } from '@/app/config/business';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { Badge } from '@/components/ui/badge';
import { REFERRAL_REWARD, REFERRAL_STATUS } from '@/features/referrals/referralMeta';
import { useAppMutation } from '@/hooks/queries';
import { formatDate, formatNumber } from '@/lib/format';
import { openWhatsApp } from '@/lib/share';
import { referralsService, type Referral, type ReferralStatus } from '@/services';
import type { BusinessType } from '@/types';

const KEY = ['platform', 'referrals'];
const STATUSES = Object.keys(REFERRAL_STATUS) as ReferralStatus[];

/** Businesses referred by Sahasra customers: call them, onboard them, then reward the referrer. */
export function ReferralsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: referralsService.platformList, refetchInterval: 30_000 });
  const setStatus = useAppMutation(({ id, status }: { id: string; status: ReferralStatus }) => referralsService.setStatus(id, status), {
    invalidate: [KEY],
    success: (r) => `${r.businessName}: ${REFERRAL_STATUS[r.status].label}`,
  });

  const stats = useMemo(() => {
    const list = data ?? [];
    const count = (...s: ReferralStatus[]) => list.filter((r) => s.includes(r.status)).length;
    return { open: count('new', 'contacted'), joined: count('joined', 'rewarded'), toReward: count('joined'), total: list.length };
  }, [data]);

  const columns: Column<Referral>[] = [
    {
      id: 'business',
      header: 'Referred business',
      hideable: false,
      sortValue: (r) => r.businessName,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[220px] truncate font-medium">{r.businessName}</p>
          <p className="text-2xs text-subtle">{[r.businessType && BUSINESS_TYPE_MAP[r.businessType as BusinessType]?.label, r.city].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      ),
    },
    { id: 'contact', header: 'Contact', sortValue: (r) => r.contactName, cell: (r) => <div><p>{r.contactName}</p><p className="text-2xs text-subtle">{r.phone}</p></div> },
    {
      id: 'referrer',
      header: 'Referred by',
      sortValue: (r) => r.referrer?.name ?? '',
      cell: (r) => <div><p className="max-w-[200px] truncate">{r.referrer?.name}</p><p className="text-2xs text-subtle">{r.referredBy}</p></div>,
    },
    { id: 'notes', header: 'Note', defaultHidden: true, cell: (r) => <span className="line-clamp-2 max-w-[240px] text-muted-foreground">{r.notes || '—'}</span> },
    { id: 'date', header: 'Received', sortValue: (r) => r.createdAt, cell: (r) => <span className="text-muted-foreground">{formatDate(r.createdAt)}</span> },
    { id: 'status', header: 'Status', sortValue: (r) => STATUSES.indexOf(r.status), cell: (r) => <Badge tone={REFERRAL_STATUS[r.status].tone} dot>{REFERRAL_STATUS[r.status].label}</Badge> },
  ];

  const mark = (status: ReferralStatus) => (r: Referral) => setStatus.mutate({ id: r.id, status });

  return (
    <>
      <PageHeader title="Referrals" description={`Businesses referred by Sahasra customers. Each referrer earns ${REFERRAL_REWARD} when their referral joins.`} />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="To follow up" value={formatNumber(stats.open)} icon={PhoneCall} loading={isLoading} accent />
        <StatCard label="Joined Sahasra" value={formatNumber(stats.joined)} icon={UserPlus} loading={isLoading} />
        <StatCard label="Rewards to give" value={formatNumber(stats.toReward)} icon={Gift} loading={isLoading} />
        <StatCard label="All referrals" value={formatNumber(stats.total)} icon={Building2} loading={isLoading} />
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.businessName} ${r.contactName} ${r.phone} ${r.city} ${r.referrer?.name ?? ''}`}
        searchPlaceholder="Search business, contact, phone or referrer"
        initialSort={{ id: 'date', dir: 'desc' }}
        filters={[{ id: 'status', label: 'Statuses', options: STATUSES.map((s) => ({ value: s, label: REFERRAL_STATUS[s].label })), predicate: (r, v) => r.status === v }]}
        rowActions={[
          { label: 'Call', icon: Phone, onSelect: (r) => window.open(`tel:${r.phone.replace(/\s/g, '')}`) },
          { label: 'Message on WhatsApp', icon: MessageCircle, onSelect: (r) => openWhatsApp(r.phone, `Hi ${r.contactName}, this is the Sahasra team. ${r.referrer?.name ?? 'A friend'} told us you might like Sahasra for billing, stock and GST. Can we show you a quick demo?`) },
          { label: 'Mark as talking', icon: PhoneCall, onSelect: mark('contacted'), hidden: (r) => r.status !== 'new' },
          { label: 'Create their business', icon: Building2, onSelect: () => navigate('/superadmin/businesses/new'), hidden: (r) => r.status === 'rewarded' || r.status === 'declined' },
          { label: 'Mark as joined', icon: UserPlus, onSelect: mark('joined'), hidden: (r) => r.status === 'joined' || r.status === 'rewarded' },
          { label: `Reward given (${REFERRAL_REWARD})`, icon: CheckCircle2, onSelect: mark('rewarded'), hidden: (r) => r.status !== 'joined' },
          { label: 'Not joining', icon: XCircle, destructive: true, onSelect: mark('declined'), hidden: (r) => r.status === 'declined' || r.status === 'rewarded' },
        ]}
        empty={<EmptyState icon={Gift} title="No referrals yet." description="When a business refers someone from Settings → Refer & Earn, it shows up here." />}
      />
    </>
  );
}
