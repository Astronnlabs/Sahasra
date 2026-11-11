import { useQuery } from '@tanstack/react-query';
import { Ban, Building2, CalendarPlus, CreditCard, ExternalLink, Globe, KeyRound, LogIn, Mail, MapPin, MapPinOff, Pencil, Phone, RotateCcw, Save, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BUSINESS_TYPE_MAP } from '@/app/config/business';
import { ALL_PAGE_IDS, withLocked } from '@/app/config/pages';
import { DetailList } from '@/components/common/DetailList';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PLAN_LABEL } from '@/app/config/constants';
import { useAppMutation } from '@/hooks/queries';
import { formatDate, formatDateTime, formatINR, timeAgo } from '@/lib/format';
import { platformTicketsService, platformUsersService, tenantsService } from '@/services';
import { TempPasswordDialog, type TempLogin } from '@/components/common/TempPasswordDialog';
import type { PlatformUser, Tenant } from '@/types';
import { EditLoginDrawer } from './EditLoginDrawer';
import { PriorityBadge } from '@/features/support/supportMeta';
import { BusinessAvatar } from './BusinessAvatar';
import { PageAccessEditor } from './PageAccessEditor';
import { PlanModal } from './PlanModal';
import { PK } from './platformKeys';
import { useSupportMode } from './useSupportMode';

function AccessTab({ tenant }: { tenant: Tenant }) {
  const saved = tenant.access ?? ALL_PAGE_IDS;
  const [draft, setDraft] = useState<string[]>(saved);
  useEffect(() => setDraft(tenant.access ?? ALL_PAGE_IDS), [tenant.access]);
  const dirty = withLocked(draft).sort().join() !== withLocked(saved).sort().join();
  const added = withLocked(draft).filter((p) => !saved.includes(p)).length;
  const removed = withLocked(saved).filter((p) => !draft.includes(p)).length;
  const save = useAppMutation(() => tenantsService.setAccess(tenant.id, draft), {
    invalidate: [PK.all],
    success: () => `Page access updated${added ? ` · ${added} added` : ''}${removed ? ` · ${removed} removed` : ''}`,
  });
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <KeyRound className="h-5 w-5 shrink-0 text-primary" />
        <p className="flex-1 text-[13px] text-muted-foreground">
          Changes are enforced immediately for everyone at <b className="text-foreground">{tenant.name}</b>. Removed pages disappear from their menu within a minute and are blocked right away.
        </p>
        <Button onClick={() => save.mutate(undefined)} disabled={!dirty} loading={save.isPending}><Save /> {dirty ? `Save access (${[added && `+${added}`, removed && `−${removed}`].filter(Boolean).join(' ')})` : 'Saved'}</Button>
      </Card>
      <PageAccessEditor value={draft} onChange={setDraft} businessType={tenant.type} saved={saved} />
    </div>
  );
}

export function BusinessDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: tenant, isLoading, isError } = useQuery({ queryKey: [...PK.tenants, id], queryFn: () => tenantsService.get(id) });
  const users = useQuery({ queryKey: [...PK.users, id], queryFn: () => platformUsersService.byTenant(id) });
  const tickets = useQuery({ queryKey: [...PK.tickets, id], queryFn: () => platformTicketsService.byTenant(id) });
  const [login, setLogin] = useState<TempLogin | null>(null);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const resetOwner = useAppMutation(() => tenantsService.resetOwnerPassword(id), {
    invalidate: [PK.all],
    onSuccess: (r) => setLogin({ name: tenant?.ownerName ?? 'Owner', login: [r.email, r.phone].filter(Boolean).join(' or '), password: r.tempPassword }),
  });
  const supportMode = useSupportMode();
  const [planFor, setPlanFor] = useState<Tenant | null>(null);
  const [suspending, setSuspending] = useState(false);
  const setStatus = useAppMutation((status: Tenant['status']) => tenantsService.setStatus(id, status), {
    invalidate: [PK.all],
    success: (t) => `${t.name} is now ${t.status}`,
    onSuccess: () => setSuspending(false),
  });
  const extend = useAppMutation(() => tenantsService.extendTrial(id, 7), { invalidate: [PK.all], success: (t) => `Trial extended to ${formatDate(t.trialEndsAt!)}` });

  if (isError) {
    return <Card><EmptyState icon={Building2} title="Business not found" description="It may have been removed." secondary={<Button asChild variant="secondary"><Link to="/superadmin/businesses">Back to businesses</Link></Button>} /></Card>;
  }
  if (isLoading || !tenant) return <div className="space-y-4"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>;

  const pages = tenant.access ?? ALL_PAGE_IDS;
  const suspended = tenant.status === 'suspended' || tenant.status === 'churned';
  const loc = tenant.location;
  const address = [tenant.addressLine, tenant.city, tenant.state, tenant.pincode].filter(Boolean).join(', ');

  return (
    <>
      <PageHeader title="Business" back={{ to: '/superadmin/businesses', label: 'Businesses' }} className="mb-4" />
      <Card className="mb-6 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <BusinessAvatar tenant={tenant} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{tenant.name}</h1>
                <StatusBadge status={tenant.status} />
                {tenant.astronLabsService || tenant.plan === 'astron_labs' ? (
                  <Badge tone="primary" className="bg-primary/10 text-primary border-primary/20 font-semibold">
                    ⚡ Astron Labs Services (Free)
                  </Badge>
                ) : (
                  <Badge tone="primary">{PLAN_LABEL[tenant.plan]}</Badge>
                )}
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{tenant.legalName ? `${tenant.legalName} · ` : ''}{BUSINESS_TYPE_MAP[tenant.type]?.label} · joined {formatDate(tenant.createdAt)}</p>
              <p className="mt-2 flex items-start gap-1.5 text-[13px] text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />{address || tenant.city}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate(`/superadmin/businesses/${tenant.id}/edit`)}><Pencil /> Edit details</Button>
            <Button variant="secondary" onClick={() => setPlanFor(tenant)}><CreditCard /> Change plan</Button>
            {tenant.status === 'trial' && <Button variant="secondary" onClick={() => extend.mutate(undefined)} loading={extend.isPending}><CalendarPlus /> +7 days trial</Button>}
            {suspended ? (
              <Button variant="secondary" onClick={() => setStatus.mutate(tenant.plan === 'trial' ? 'trial' : 'active')}><RotateCcw /> Reactivate</Button>
            ) : (
              <Button variant="danger-soft" onClick={() => setSuspending(true)}><Ban /> Suspend</Button>
            )}
            <Button onClick={() => supportMode(tenant)} disabled={suspended}><LogIn /> Support mode</Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Pages enabled', `${pages.length} / ${ALL_PAGE_IDS.length}`],
            ['Users', users.data?.length ?? tenant.users],
            [
              'MRR / Billing',
              tenant.astronLabsService || tenant.plan === 'astron_labs' ? 'Free (Astron Labs)' : formatINR(tenant.mrr),
            ],
            ['Last active', timeAgo(tenant.lastActive)],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border border-border bg-surface/50 px-4 py-3">
              <p className="text-2xs font-medium uppercase tracking-wider text-subtle">{l}</p>
              <p className="tabular mt-1 text-lg font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </Card>

      <Tabs value={params.get('tab') ?? 'overview'} onValueChange={(tab) => setParams(tab === 'overview' ? {} : { tab }, { replace: true })}>
        <TabsList variant="underline">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="access">Page access <Badge tone="primary">{pages.length}</Badge></TabsTrigger>
          <TabsTrigger value="users">Users {users.data && <Badge tone="neutral">{users.data.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="tickets">Support tickets {tickets.data && tickets.data.length > 0 && <Badge tone="neutral">{tickets.data.length}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Business details" icon={<Building2 />} />
              <CardContent>
                {(tenant.astronLabsService || tenant.plan === 'astron_labs') && (
                  <div className="mb-4 rounded-xl border border-primary/25 bg-primary-soft/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">Covered under Astron Labs Digital Marketing Services</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Billing is 100% free (₹0/mo).
                          {tenant.planValidTo && (
                            <> Valid until <b className="text-foreground">{formatDate(tenant.planValidTo)}</b> ({new Date(tenant.planValidTo) > new Date() ? 'Active' : 'Expired'}).</>
                          )}
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => setPlanFor(tenant)}>Adjust validity</Button>
                    </div>
                  </div>
                )}
                <DetailList
                  columns={2}
                  items={[
                    ['Brand name', tenant.name],
                    ['Legal name', tenant.legalName || '—'],
                    ['Industry', BUSINESS_TYPE_MAP[tenant.type]?.label],
                    ['GSTIN', tenant.gstin || 'Not registered'],
                    ['Business PAN', tenant.pan || '—'],
                    ['Business phone', tenant.businessPhone ? <span key="p" className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-subtle" />{tenant.businessPhone}</span> : '—'],
                    ['Business email', tenant.businessEmail ? <span key="e" className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-subtle" />{tenant.businessEmail}</span> : '—'],
                    ['Website', tenant.website ? <a key="w" href={tenant.website.startsWith('http') ? tenant.website : `https://${tenant.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Globe className="h-3.5 w-3.5" />{tenant.website}</a> : '—'],
                    ['Address', address || '—'],
                    ['Plan', tenant.astronLabsService || tenant.plan === 'astron_labs' ? 'Astron Labs Services (Free)' : `${PLAN_LABEL[tenant.plan]}${tenant.trialEndsAt && tenant.status === 'trial' ? ` · trial ends ${formatDate(tenant.trialEndsAt)}` : ''}`],
                    ...(tenant.astronLabsService || tenant.plan === 'astron_labs'
                      ? [
                          [
                            'Service validity',
                            tenant.planValidTo
                              ? `${tenant.planValidFrom ? formatDate(tenant.planValidFrom) + ' to ' : ''}${formatDate(tenant.planValidTo)} (${new Date(tenant.planValidTo) > new Date() ? 'Active' : 'Expired'})`
                              : 'Ongoing',
                          ] as [string, string],
                        ]
                      : []),
                  ]}
                />
                {tenant.notes && <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-[13px] text-muted-foreground"><b className="text-foreground">Internal note: </b>{tenant.notes}</p>}
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader title="Owner" icon={<Avatar name={tenant.ownerName} size="xs" />} />
                <CardContent>
                  <DetailList columns={1} items={[['Name', tenant.ownerName], ['Email (login)', tenant.ownerEmail], ['Mobile (login)', tenant.phone], ['Alternate mobile', tenant.ownerAltPhone || '—'], ['PAN', tenant.ownerPan || '—']]} />
                  <Button variant="secondary" size="sm" className="mt-4" onClick={() => resetOwner.mutate(undefined)} loading={resetOwner.isPending}><KeyRound /> Reset owner password</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader title="Location" icon={loc ? <MapPin /> : <MapPinOff />} />
                <CardContent>
                  {loc ? (
                    <>
                      <dl className="grid grid-cols-2 gap-3 text-[13px]">
                        <div><dt className="text-2xs uppercase tracking-wider text-subtle">Latitude</dt><dd className="tabular font-semibold">{loc.latitude.toFixed(6)}</dd></div>
                        <div><dt className="text-2xs uppercase tracking-wider text-subtle">Longitude</dt><dd className="tabular font-semibold">{loc.longitude.toFixed(6)}</dd></div>
                        <div><dt className="text-2xs uppercase tracking-wider text-subtle">Altitude</dt><dd className="tabular font-semibold">{loc.altitude === null ? 'Not reported' : `${loc.altitude} m`}</dd></div>
                        <div><dt className="text-2xs uppercase tracking-wider text-subtle">Accuracy</dt><dd className="tabular font-semibold">{loc.accuracy === null ? '—' : `± ${loc.accuracy} m`}</dd></div>
                      </dl>
                      <p className="mt-3 text-2xs text-subtle">{loc.source === 'device' ? 'Captured from device' : 'Entered manually'} · {formatDateTime(loc.capturedAt)}</p>
                      <Button asChild variant="secondary" size="sm" className="mt-3">
                        <a href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open in Google Maps</a>
                      </Button>
                    </>
                  ) : (
                    <div className="text-center">
                      <p className="text-[13px] text-muted-foreground">No location captured yet.</p>
                      <Button variant="soft" size="sm" className="mt-3" onClick={() => navigate(`/superadmin/businesses/${tenant.id}/edit#location`)}><MapPin /> Capture location</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="access"><AccessTab tenant={tenant} /></TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader title="People with access" description="Owner and staff logins for this business" actions={<Button size="sm" variant="soft" onClick={() => navigate(`/superadmin/users?business=${tenant.id}`)}><UserPlus /> Add user</Button>} />
            <ul className="divide-y divide-border px-2 pb-2 pt-3">
              {users.data?.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-3 py-3">
                  <Avatar name={u.name} size="sm" />
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{u.name}</p><p className="truncate text-2xs text-muted-foreground">{u.email} · {u.phone}</p></div>
                  <Badge tone={u.role === 'Owner' ? 'primary' : 'neutral'}>{u.role}</Badge>
                  <StatusBadge status={u.status} />
                  <span className="hidden w-28 text-right text-2xs text-subtle sm:block">{u.lastLogin ? `Signed in ${timeAgo(u.lastLogin)}` : 'Never signed in'}</span>
                  <Button variant="ghost" size="sm" onClick={() => setEditingUser(u)}><Pencil /> Edit login</Button>
                </li>
              ))}
              {users.data?.length === 0 && <li className="py-10 text-center text-[13px] text-muted-foreground">No users yet.</li>}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="tickets">
          {tickets.data?.length ? (
            <Card className="divide-y divide-border">
              {tickets.data.map((t) => (
                <Link key={t.id} to={`/superadmin/support?ticket=${t.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface">
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{t.subject}</p><p className="text-2xs text-muted-foreground">{t.number} · {timeAgo(t.updatedAt)}</p></div>
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </Link>
              ))}
            </Card>
          ) : (
            <Card><EmptyState compact icon={Mail} title="No support tickets" description={`${tenant.name} hasn't raised any support requests.`} /></Card>
          )}
        </TabsContent>
      </Tabs>

      <PlanModal tenant={planFor} onClose={() => setPlanFor(null)} />
      <TempPasswordDialog value={login} onClose={() => setLogin(null)} />
      <EditLoginDrawer user={editingUser} onClose={() => setEditingUser(null)} />
      <ConfirmDialog
        open={suspending}
        onOpenChange={setSuspending}
        title={`Suspend ${tenant.name}?`}
        description="All users of this business are blocked from signing in until you reactivate it. Their data is kept safe."
        confirmLabel="Suspend business"
        destructive
        loading={setStatus.isPending}
        onConfirm={() => setStatus.mutate('suspended')}
      />
    </>
  );
}
