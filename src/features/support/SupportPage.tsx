import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { LifeBuoy, MessageSquarePlus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusBadge } from '@/components/feedback/StatusBadge';
import { FormField } from '@/components/forms/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppMutation } from '@/hooks/queries';
import { timeAgo } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { ticketsService } from '@/services';
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, PriorityBadge } from './supportMeta';
import { TicketThread } from './TicketThread';

const schema = z.object({
  subject: z.string().trim().min(5, 'Describe the issue in a few words').max(120),
  category: z.enum(['billing', 'technical', 'gst', 'account', 'feature']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  text: z.string().trim().min(10, 'Add a few more details so we can help faster').max(2000),
});
type Values = z.infer<typeof schema>;

export function SupportPage() {
  const ws = useWorkspace();
  const key = ['support', ws.tenantId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: ticketsService.list, refetchInterval: 15000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const tickets = (data ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selected = tickets.find((t) => t.id === selectedId) ?? tickets[0];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) reset({ subject: '', category: 'technical', priority: 'medium', text: '' });
  }, [open, reset]);

  const create = useAppMutation(
    (v: Values) =>
      ticketsService.open({
        subject: sanitizeText(v.subject, 120),
        category: v.category,
        priority: v.priority,
        text: sanitizeText(v.text, 2000),
      }),
    { invalidate: [key], success: (t) => `Ticket ${t.number} raised — our team will reply shortly`, onSuccess: (t) => { setOpen(false); setSelectedId(t.id); } },
  );
  const reply = useAppMutation(({ id, text }: { id: string; text: string }) => ticketsService.reply(id, text), { invalidate: [key] });

  return (
    <>
      <PageHeader
        title="Help & Support"
        description="Talk to the Sahasra team. Replies appear here and in your notifications."
        actions={<Button onClick={() => setOpen(true)}><MessageSquarePlus /> New ticket</Button>}
      />

      {isLoading ? (
        <Skeleton className="h-[480px] rounded-2xl" />
      ) : tickets.length === 0 ? (
        <Card>
          <EmptyState icon={LifeBuoy} title="No support tickets yet." description="Stuck on something? Raise a ticket and the Sahasra team will help you." actionLabel="New ticket" onAction={() => setOpen(true)} />
        </Card>
      ) : (
        <Card className="grid min-h-[520px] overflow-hidden lg:grid-cols-[340px_1fr]">
          <ul className="scrollbar-thin max-h-[640px] divide-y divide-border overflow-y-auto border-b border-border lg:border-b-0 lg:border-r" aria-label="Your tickets">
            {tickets.map((t) => {
              const lastAgent = [...t.messages].reverse().find((m) => m.from !== 'note');
              const awaiting = lastAgent?.from === 'agent' && t.status === 'pending';
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => setSelectedId(t.id)} aria-current={selected?.id === t.id} className={cn('w-full px-4 py-3.5 text-left transition-colors', selected?.id === t.id ? 'bg-primary-soft' : 'hover:bg-surface')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xs font-semibold text-subtle">{t.number}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="mt-1 truncate text-[13px] font-semibold">{t.subject}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
                      {awaiting && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="New reply" />}
                      {awaiting ? 'Sahasra replied' : 'Updated'} {timeAgo(t.updatedAt)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && (
            <section className="flex min-h-0 flex-col" aria-label={`Ticket ${selected.number}`}>
              <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{selected.subject}</p>
                  <p className="text-xs text-muted-foreground">{selected.number} · {CATEGORY_LABEL[selected.category]}{selected.assignee ? ` · Handled by ${selected.assignee.split(' ')[0]}` : ''}</p>
                </div>
                <PriorityBadge priority={selected.priority} />
                <StatusBadge status={selected.status} />
              </header>
              <TicketThread ticket={selected} viewer="customer" sending={reply.isPending} onSend={(text) => reply.mutate({ id: selected.id, text })} />
            </section>
          )}
        </Card>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Raise a support ticket"
        description={`From ${ws.businessName}`}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={handleSubmit((v) => create.mutate(v))} loading={create.isPending}><Plus /> Submit ticket</Button></>}
      >
        <form className="space-y-4 pb-2" onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
          <FormField label="Subject" error={errors.subject?.message} required><Input {...register('subject')} placeholder="e.g. Printer not printing KOT" autoFocus /></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category"><NativeSelect {...register('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</NativeSelect></FormField>
            <FormField label="Priority"><NativeSelect {...register('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</NativeSelect></FormField>
          </div>
          <FormField label="Describe the problem" error={errors.text?.message} required><Textarea {...register('text')} rows={5} placeholder="What happened, what you expected, and any invoice numbers involved." /></FormField>
        </form>
      </Modal>
    </>
  );
}
