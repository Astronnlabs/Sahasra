import {
  AlertTriangle,
  Bell,
  CalendarX,
  CheckCheck,
  FileText,
  Landmark,
  PackageCheck,
  PackageMinus,
  PackageX,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { qk, useAppMutation, useNotifications } from '@/hooks/queries';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { notificationsService } from '@/services';
import type { AppNotification, NotificationKind } from '@/types';

export const NOTIFICATION_META: Record<NotificationKind, { icon: LucideIcon; tone: string; label: string }> = {
  'low-stock': { icon: PackageMinus, tone: 'bg-warning-soft text-warning', label: 'Low stock' },
  'out-of-stock': { icon: PackageX, tone: 'bg-danger-soft text-danger', label: 'Out of stock' },
  'payment-overdue': { icon: AlertTriangle, tone: 'bg-danger-soft text-danger', label: 'Payment overdue' },
  'gst-reminder': { icon: Landmark, tone: 'bg-primary-light text-primary', label: 'GST reminder' },
  'employee-absence': { icon: CalendarX, tone: 'bg-info-soft text-info', label: 'Employee absence' },
  'invoice-created': { icon: FileText, tone: 'bg-success-soft text-success', label: 'Invoice created' },
  'purchase-received': { icon: PackageCheck, tone: 'bg-success-soft text-success', label: 'Purchase received' },
  system: { icon: ShieldCheck, tone: 'bg-surface text-muted-foreground', label: 'System alert' },
};

export function NotificationItem({ n, onOpen }: { n: AppNotification; onOpen?: (n: AppNotification) => void }) {
  const meta = NOTIFICATION_META[n.kind] ?? NOTIFICATION_META.system;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(n)}
      className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface', !n.read && 'bg-primary-soft/70')}
    >
      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.tone)}>
        <meta.icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium">{n.title}</span>
          {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.message}</span>
        <span className="mt-1 block text-2xs text-subtle">{timeAgo(n.createdAt)}</span>
      </span>
    </button>
  );
}

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data, isLoading } = useNotifications();
  const unread = data?.filter((n) => !n.read).length ?? 0;
  const markAll = useAppMutation(() => notificationsService.markAllRead(), { invalidate: [qk.notifications] });
  const markOne = useAppMutation((id: string) => notificationsService.markRead(id), { invalidate: [qk.notifications] });

  // Pop up stock alerts as they arrive (not the ones already there when the app opened).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    if (seen.current) {
      for (const n of data) {
        if (seen.current.has(n.id) || n.read || (n.kind !== 'low-stock' && n.kind !== 'out-of-stock')) continue;
        const show = n.kind === 'out-of-stock' ? toast.error : toast.warning;
        show(n.title, { description: n.message, action: n.href ? { label: 'View', onClick: () => navigate(n.href!) } : undefined });
      }
    }
    seen.current = new Set(data.map((n) => n.id));
  }, [data, navigate]);

  const openItem = (n: AppNotification) => {
    if (!n.read) markOne.mutate(n.id);
    setOpen(false);
    if (n.href) navigate(n.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="!size-[18px]" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white ring-2 ring-card">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(380px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up"}</p>
          </div>
          <Button variant="ghost" size="sm" disabled={!unread} onClick={() => markAll.mutate(undefined)}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="scrollbar-thin max-h-[380px] space-y-0.5 overflow-y-auto p-2">
          {isLoading
            ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
            : data?.slice(0, 6).map((n) => <NotificationItem key={n.id} n={n} onOpen={openItem} />)}
        </div>
        <div className="border-t border-border p-2">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block rounded-lg py-2 text-center text-[13px] font-medium text-primary transition-colors hover:bg-primary-light"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
