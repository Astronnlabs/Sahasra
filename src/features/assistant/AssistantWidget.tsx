import { ArrowUpRight, Bot, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { ASSISTANT_SUGGESTIONS, assistantService, type AssistantReply } from '@/services';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  reply?: AssistantReply;
}

const WELCOME: Message = {
  id: 0,
  role: 'assistant',
  text: 'Namaste! I’m Sahasra AI. Ask me about your sales, stock, dues or customers.',
};

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const ask = async (raw: string) => {
    const text = sanitizeText(raw, 300);
    if (!text || thinking) return;
    setInput('');
    setMessages((m) => [...m, { id: Date.now(), role: 'user', text }]);
    setThinking(true);
    const reply = await assistantService.ask(text);
    setThinking(false);
    setMessages((m) => [...m, { id: Date.now() + 1, role: 'assistant', text: reply.text, reply }]);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Sahasra AI' : 'Open Sahasra AI'}
        aria-expanded={open}
        className={cn(
          'fixed bottom-20 right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-primary pl-3.5 pr-4 text-[13px] font-semibold text-white shadow-[0_10px_30px_-8px_rgb(109_61_232/0.7)] transition-all duration-200 hover:bg-primary-hover hover:shadow-[0_12px_34px_-6px_rgb(109_61_232/0.75)] lg:bottom-6 lg:right-6',
          open && 'pr-3.5',
        )}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        {!open && <span className="hidden sm:inline">Sahasra AI</span>}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Sahasra AI assistant"
          className="fixed inset-x-3 bottom-36 z-40 flex max-h-[min(70vh,600px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-pop animate-fade-up sm:inset-x-auto sm:right-6 sm:w-[380px] lg:bottom-[5.5rem]"
        >
          <header className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-primary to-primary-dark px-4 py-3.5 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <Bot className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Sahasra AI</p>
              <p className="text-2xs text-white/75">Business insights from your workspace data</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={listRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.map((m) => (
              <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                    m.role === 'user' ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md bg-surface text-foreground',
                  )}
                >
                  <p>{m.text}</p>
                  {m.reply?.bullets && (
                    <ul className="mt-2 space-y-1">
                      {m.reply.bullets.map((b) => (
                        <li key={b} className="flex gap-2 text-xs text-muted-foreground">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.reply?.link && (
                    <Link
                      to={m.reply.link.href}
                      onClick={() => setOpen(false)}
                      className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      {m.reply.link.label} <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface px-4 py-3" aria-label="Sahasra AI is thinking">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="scrollbar-none flex gap-1.5 overflow-x-auto border-t border-border px-3 pt-3">
            {ASSISTANT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex items-center gap-2 p-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your business…"
              maxLength={300}
              aria-label="Ask Sahasra AI"
              className="h-10 flex-1 rounded-xl border border-border bg-surface/60 px-3.5 text-[13px] outline-none transition-colors placeholder:text-subtle focus:border-primary/50 focus:bg-card"
            />
            <Button type="submit" size="icon" className="h-10 w-10 rounded-xl" disabled={!input.trim() || thinking} aria-label="Send">
              <Send />
            </Button>
          </form>
        </section>
      )}
    </>
  );
}
