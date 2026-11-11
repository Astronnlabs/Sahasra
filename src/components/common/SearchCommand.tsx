import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  ArrowRight,
  Briefcase,
  ClipboardList,
  CornerDownLeft,
  FileText,
  Loader2,
  Package,
  Plus,
  Search,
  Sparkles,
  Truck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ALL_PAGES } from '@/app/config/navigation';
import { usePageAccess } from '@/hooks/usePageAccess';
import { searchService } from '@/services';
import type { SearchResult } from '@/types';

const TYPE_META: Record<SearchResult['type'], { label: string; icon: LucideIcon }> = {
  customer: { label: 'Customers', icon: User },
  invoice: { label: 'Invoices', icon: FileText },
  product: { label: 'Products', icon: Package },
  vendor: { label: 'Vendors', icon: Truck },
  employee: { label: 'Employees', icon: Briefcase },
  service: { label: 'Services', icon: Sparkles },
  order: { label: 'Orders', icon: ClipboardList },
  page: { label: 'Pages', icon: ArrowRight },
};

const QUICK_ACTIONS = [
  { label: 'New sale (POS)', to: '/pos' },
  { label: 'Record purchase', to: '/purchases/new' },
  { label: 'Add customer', to: '/customers?new=1' },
  { label: 'Add product', to: '/products?new=1' },
  { label: 'Add expense', to: '/expenses?new=1' },
];

const itemClass =
  'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] outline-none data-[selected=true]:bg-primary-light data-[selected=true]:text-foreground';

export function SearchCommand({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());
  const navigate = useNavigate();
  const { can } = usePageAccess();

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', deferred],
    queryFn: () => searchService.query(deferred),
    enabled: open && deferred.length >= 2,
    staleTime: 10_000,
  });

  const go = (to: string) => {
    onOpenChange(false);
    setQuery('');
    navigate(to);
  };

  const pages = ALL_PAGES.filter((p) => can(p.page)).filter((p) => !deferred || p.label.toLowerCase().includes(deferred.toLowerCase())).slice(0, deferred ? 5 : 8);
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0f0c1d]/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]">
          <DialogPrimitive.Title className="sr-only">Search Sahaasra</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search customers, invoices, products, vendors, employees, services and pages.</DialogPrimitive.Description>
          <Command shouldFilter={false} loop label="Global search">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-[18px] w-[18px] text-primary" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search customers, invoices, products, vendors…"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
              />
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-subtle" />}
              <kbd className="rounded-md border border-border px-1.5 py-0.5 text-2xs text-muted-foreground">Esc</kbd>
            </div>
            <Command.List className="scrollbar-thin max-h-[min(60vh,460px)] overflow-y-auto p-2">
              {deferred.length >= 2 && !isFetching && results.length === 0 && pages.length === 0 && (
                <Command.Empty className="px-4 py-12 text-center">
                  <p className="text-sm font-medium">No matches for “{deferred}”</p>
                  <p className="mt-1 text-xs text-muted-foreground">Try a name, phone number, invoice number or SKU.</p>
                </Command.Empty>
              )}

              {Object.entries(grouped).map(([type, items]) => {
                const meta = TYPE_META[type as SearchResult['type']];
                return (
                  <Command.Group key={type} heading={meta.label} className="[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2">
                    {items.map((r) => (
                      <Command.Item key={r.type + r.id} value={r.type + r.id} onSelect={() => go(r.href)} className={itemClass}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                          <meta.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>
                        </span>
                        {r.meta && <span className="hidden text-xs capitalize text-subtle sm:block">{r.meta}</span>}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}

              {!deferred && (
                <Command.Group heading="Quick actions" className="[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2">
                  {QUICK_ACTIONS.map((a) => (
                    <Command.Item key={a.to} value={a.label} onSelect={() => go(a.to)} className={itemClass}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary">
                        <Plus className="h-4 w-4" />
                      </span>
                      {a.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {pages.length > 0 && (
                <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:section-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2">
                  {pages.map((p) => (
                    <Command.Item key={p.to} value={`page-${p.to}`} onSelect={() => go(p.to)} className={itemClass}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                        <p.icon className="h-4 w-4" />
                      </span>
                      {p.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-border bg-surface/60 px-4 py-2.5 text-2xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" /> to open
              </span>
              <span>↑ ↓ to navigate</span>
              <span className="ml-auto">Search by name, phone, invoice no. or SKU</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
