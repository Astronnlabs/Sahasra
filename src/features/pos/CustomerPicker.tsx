import { Check, ChevronDown, ChevronsUpDown, Search, UserPlus, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CITIES } from '@/app/config/constants';
import { FormField } from '@/components/forms/FormField';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { qk, useAppMutation, useCustomers } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import { sanitizeText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { customersService } from '@/services';
import type { Customer } from '@/types';
import { WALK_IN, type CartCustomer } from './usePosCart';

const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits10 = (s: string) => s.replace(/\D/g, '').slice(-10);
const toCart = (c: Customer): CartCustomer => ({ id: c.id, name: c.name, phone: c.phone, outstanding: c.outstanding });

/** Quick "add customer" from the bill: name and mobile, with optional details. */
function NewCustomerModal({ open, onOpenChange, initial, customers, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; initial: string; customers: Customer[]; onSaved: (c: CartCustomer) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [gstin, setGstin] = useState('');
  const [more, setMore] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    // What was typed in the search becomes the phone (if digits) or the name.
    const isPhone = /^[\d\s+-]{6,}$/.test(initial.trim());
    setName(isPhone ? '' : initial.trim().replace(/\b\w/g, (ch) => ch.toUpperCase()));
    setPhone(isPhone ? initial.trim() : '');
    setEmail('');
    setCity('');
    setGstin('');
    setMore(false);
    setTouched(false);
  }, [open, initial]);

  const existing = digits10(phone).length === 10 ? customers.find((c) => digits10(c.phone) === digits10(phone)) : undefined;
  const errors = {
    name: sanitizeText(name, 80).length < 2 ? 'Enter the customer’s name' : undefined,
    phone: !PHONE_RE.test(phone.trim()) ? 'Enter a valid 10-digit mobile number' : existing ? `Already saved as ${existing.name}` : undefined,
    email: email.trim() && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email' : undefined,
    gstin: gstin.trim() && !GSTIN_RE.test(gstin.trim().toUpperCase()) ? 'GSTIN should look like 27ABCDE1234F1Z5' : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const save = useAppMutation(
    () => customersService.create({ name: sanitizeText(name, 80), phone: phone.trim(), email: email.trim(), city: sanitizeText(city, 60), gstin: gstin.trim().toUpperCase() || undefined, tags: [] }),
    {
      invalidate: [qk.customers],
      success: (c) => `${c.name} saved and added to the bill`,
      onSuccess: (c) => {
        onSaved(toCart(c));
        onOpenChange(false);
      },
    },
  );
  const submit = () => {
    setTouched(true);
    if (valid) save.mutate(undefined);
  };
  const show = (e?: string) => (touched ? e : undefined);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add customer"
      description="Saved to Customers so you can see their bills, dues and send reminders."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}><UserPlus /> Save & add to bill</Button>
        </>
      }
    >
      <form
        className="space-y-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <FormField label="Full name" required error={show(errors.name)}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" autoFocus={!name} maxLength={80} />
        </FormField>
        <FormField label="Mobile number" required error={existing ? undefined : show(errors.phone)}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+-]/g, ''))} placeholder="98200 11223" inputMode="tel" autoFocus={!!name} maxLength={16} />
        </FormField>
        {existing && (
          <div className="flex items-center gap-3 rounded-xl bg-warning-soft px-3 py-2.5 text-[13px]">
            <span className="flex-1">This number is already saved as <b>{existing.name}</b>.</span>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onSaved(toCart(existing));
                onOpenChange(false);
              }}
            >
              Use
            </Button>
          </div>
        )}
        <button type="button" onClick={() => setMore((m) => !m)} className="flex items-center gap-1 text-xs font-medium text-primary">
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', more && 'rotate-180')} /> {more ? 'Fewer details' : 'More details (email, city, GSTIN)'}
        </button>
        {more && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Email" error={show(errors.email)}>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.in" />
            </FormField>
            <FormField label="City">
              <Input value={city} onChange={(e) => setCity(e.target.value)} list="pos-cities" placeholder="Pune" />
            </FormField>
            <datalist id="pos-cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
            <FormField label="GSTIN" error={show(errors.gstin)} hint="For B2B (tax) invoices." className="sm:col-span-2">
              <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} className="uppercase" maxLength={15} placeholder="27ABCDE1234F1Z5" />
            </FormField>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function CustomerPicker({ value, onChange }: { value: CartCustomer; onChange: (c: CartCustomer) => void }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const { data } = useCustomers();
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((c) => !term || c.name.toLowerCase().includes(term) || c.phone.replace(/\s/g, '').includes(term.replace(/\s/g, ''))).slice(0, 8);
  }, [data, q]);

  const pick = (c: CartCustomer) => {
    onChange(c);
    setOpen(false);
    setQ('');
  };
  const startAdding = () => {
    setOpen(false);
    setAdding(true);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2">
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40"
              aria-label="Select customer"
            >
              {value.id ? <Avatar name={value.name} size="sm" /> : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-subtle">
                  <UserRound className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{value.name}</span>
                <span className="block truncate text-2xs text-muted-foreground">
                  {value.id ? `${value.phone}${value.outstanding ? ` · ${formatINR(value.outstanding)} due` : ''}` : 'Tap to choose a customer'}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 text-subtle" />
            </button>
          </PopoverTrigger>
          <Button type="button" variant="secondary" size="icon" className="h-[50px] w-[50px] shrink-0 rounded-xl" onClick={startAdding} aria-label="Add new customer" title="Add new customer">
            <UserPlus />
          </Button>
        </div>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-2">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or phone"
              aria-label="Search customers"
              className="h-9 w-full rounded-lg border border-border bg-surface/60 pl-9 pr-3 text-[13px] outline-none focus:border-primary/50"
            />
          </div>
          <ul className="scrollbar-thin max-h-64 overflow-y-auto" role="listbox" aria-label="Customers">
            <li>
              <button type="button" onClick={() => pick(WALK_IN)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-surface">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface"><UserRound className="h-3.5 w-3.5 text-subtle" /></span>
                <span className="flex-1">Walk-in Customer</span>
                {!value.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            </li>
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value.id === c.id}
                  onClick={() => pick(toCart(c))}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface', value.id === c.id && 'bg-primary-soft')}
                >
                  <Avatar name={c.name} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{c.name}</span>
                    <span className="block text-2xs text-muted-foreground">{c.phone}</span>
                  </span>
                  {c.outstanding > 0 && <span className="text-2xs font-medium text-danger">{formatINR(c.outstanding)} due</span>}
                </button>
              </li>
            ))}
            {q.trim() && !results.length && <li className="px-2 py-2 text-xs text-muted-foreground">No saved customer matches “{q.trim()}”.</li>}
          </ul>
          <div className="mt-1 space-y-0.5 border-t border-border pt-1.5">
            <button type="button" onClick={startAdding} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium text-primary hover:bg-primary-soft">
              <UserPlus className="h-4 w-4" /> {q.trim() ? `Add “${q.trim()}” as a new customer` : 'Add new customer'}
            </button>
            {q.trim().length > 1 && !/^[\d\s+-]+$/.test(q.trim()) && (
              <button
                type="button"
                onClick={() => pick({ name: q.trim().replace(/\b\w/g, (ch) => ch.toUpperCase()) })}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-surface"
              >
                Just print “{q.trim()}” on this bill (don’t save)
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <NewCustomerModal open={adding} onOpenChange={setAdding} initial={q} customers={data ?? []} onSaved={pick} />
    </>
  );
}
