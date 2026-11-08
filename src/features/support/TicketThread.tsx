import { Headset, Lock, Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import type { SupportTicket, TicketMessage } from '@/types';

interface Props {
  ticket: SupportTicket;
  /** Agents see internal notes and can write them; customers never see notes. */
  viewer: 'customer' | 'agent';
  onSend: (text: string, kind: TicketMessage['from']) => void;
  sending?: boolean;
}

export function TicketThread({ ticket, viewer, onSend, sending }: Props) {
  const [text, setText] = useState('');
  const [note, setNote] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = viewer === 'agent' ? ticket.messages : ticket.messages.filter((m) => m.from !== 'note');
  const closed = ticket.status === 'closed';

  useEffect(() => {
    // Block body on purpose: newer browsers return a Promise from scrollIntoView, which must not be the effect cleanup.
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = (e: FormEvent | { preventDefault(): void }) => {
    e.preventDefault();
    const clean = sanitizeText(text, 2000);
    if (!clean) return;
    onSend(clean, viewer === 'customer' ? 'customer' : note ? 'note' : 'agent');
    setText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ol className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5" aria-label="Conversation">
        {messages.map((m) => {
          const mine = (viewer === 'agent' && m.from !== 'customer') || (viewer === 'customer' && m.from === 'customer');
          const isNote = m.from === 'note';
          return (
            <li key={m.id} className={cn('flex gap-3', mine && 'flex-row-reverse')}>
              {m.from === 'customer' ? (
                <Avatar name={m.author} size="sm" />
              ) : (
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', isNote ? 'bg-warning-soft text-warning' : 'bg-primary text-white')}>
                  {isNote ? <Lock className="h-3.5 w-3.5" /> : <Headset className="h-4 w-4" />}
                </span>
              )}
              <div className={cn('max-w-[78%]', mine && 'text-right')}>
                <p className="mb-1 text-2xs text-subtle">
                  <span className="font-semibold text-muted-foreground">{m.author}</span> · {formatDateTime(m.at)}
                  {isNote && <span className="ml-1 font-semibold text-warning">· Internal note</span>}
                </p>
                <div
                  className={cn(
                    'inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-left text-[13px] leading-relaxed',
                    isNote ? 'border border-dashed border-warning/50 bg-warning-soft/60' : mine ? 'rounded-tr-md bg-primary text-white' : 'rounded-tl-md bg-surface',
                  )}
                >
                  {m.text}
                </div>
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>

      {closed ? (
        <p className="border-t border-border px-5 py-4 text-center text-xs text-muted-foreground">This ticket is closed. {viewer === 'customer' ? 'Raise a new ticket if you still need help.' : 'Reopen it to reply.'}</p>
      ) : (
        <form onSubmit={submit} className={cn('border-t border-border p-4', note && 'bg-warning-soft/30')}>
          {viewer === 'agent' && (
            <div className="mb-2 flex gap-1 text-xs" role="radiogroup" aria-label="Message type">
              {[false, true].map((n) => (
                <button key={String(n)} type="button" role="radio" aria-checked={note === n} onClick={() => setNote(n)} className={cn('rounded-md px-2.5 py-1 font-medium', note === n ? (n ? 'bg-warning-soft text-[#8a5d07] dark:text-warning' : 'bg-primary-light text-primary') : 'text-muted-foreground')}>
                  {n ? 'Internal note' : 'Reply to customer'}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e);
              }}
              rows={2}
              maxLength={2000}
              placeholder={viewer === 'customer' ? 'Write a message to Sahasra Support…' : note ? 'Only your team will see this note…' : `Reply to ${ticket.requester}…`}
              aria-label="Message"
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-[13px] outline-none focus:border-primary/50"
            />
            <Button type="submit" size="icon" className="h-11 w-11 rounded-xl" disabled={!text.trim()} loading={sending} aria-label="Send">
              {!sending && <Send />}
            </Button>
          </div>
          <p className="mt-1.5 text-2xs text-subtle">Ctrl + Enter to send</p>
        </form>
      )}
    </div>
  );
}
