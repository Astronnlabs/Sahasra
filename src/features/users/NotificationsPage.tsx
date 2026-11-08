import { BellOff, CheckCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/feedback/EmptyState';
import { NOTIFICATION_META, NotificationItem } from '@/components/layout/NotificationsPopover';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { qk, useAppMutation, useNotifications } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { notificationsService } from '@/services';
import type { AppNotification, NotificationKind } from '@/types';

export function NotificationsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread' | NotificationKind>('all');
  const markAll = useAppMutation(() => notificationsService.markAllRead(), { invalidate: [qk.notifications], success: 'All notifications marked as read' });
  const markOne = useAppMutation((id: string) => notificationsService.markRead(id), { invalidate: [qk.notifications] });
  const remove = useAppMutation((id: string) => notificationsService.remove(id), { invalidate: [qk.notifications], success: 'Notification deleted' });

  const list = (data ?? []).filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : n.kind === filter));
  const unread = data?.filter((n) => !n.read).length ?? 0;

  const open = (n: AppNotification) => {
    if (!n.read) markOne.mutate(n.id);
    if (n.href) navigate(n.href);
  };

  const chips: { id: typeof filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: `Unread${unread ? ` (${unread})` : ''}` },
    ...(Object.keys(NOTIFICATION_META) as NotificationKind[]).map((k) => ({ id: k, label: NOTIFICATION_META[k].label })),
  ];

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Alerts about stock, payments, GST, staff and your workspace."
        actions={<Button variant="secondary" onClick={() => markAll.mutate(undefined)} disabled={!unread}><CheckCheck /> Mark all read</Button>}
      />
      <div className="scrollbar-none mb-4 flex gap-1.5 overflow-x-auto">
        {chips.map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)} className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors', filter === c.id ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted-foreground hover:border-primary/40')}>
            {c.label}
          </button>
        ))}
      </div>
      <Card className="p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : list.length === 0 ? (
          <EmptyState icon={BellOff} title="Nothing here" description={filter === 'unread' ? "You're all caught up." : 'No notifications of this type yet.'} />
        ) : (
          <div className="space-y-0.5">
            {list.map((n) => (
              <div key={n.id} className="group flex items-center gap-1">
                <div className="min-w-0 flex-1"><NotificationItem n={n} onOpen={open} /></div>
                <Button variant="ghost" size="icon-sm" className="shrink-0 text-subtle opacity-60 hover:text-danger group-hover:opacity-100" onClick={() => remove.mutate(n.id)} aria-label="Delete notification" title="Delete">
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
