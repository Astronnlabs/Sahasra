import { Minus, PauseCircle, Percent, Plus, ReceiptText, ShoppingCart, StickyNote, Trash2, UserRound, X } from 'lucide-react';
import { useState, type Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BillStaff } from '@/services';
import { CustomerPicker } from './CustomerPicker';
import type { CartAction, CartState, computeTotals } from './usePosCart';

type Totals = ReturnType<typeof computeTotals>;

interface CartPanelProps {
  state: CartState;
  dispatch: Dispatch<CartAction>;
  totals: Totals;
  onHold: () => void;
  onPay: () => void;
  /** Show the Retail / Trade price switch. */
  showTradePrice?: boolean;
  /** Salons: staff who can be named as "done by" on each service (undefined = not used). */
  staff?: BillStaff[];
  /** Names of the staff set on a service, listed first. */
  serviceStaff?: (serviceId: string) => string[];
  className?: string;
}

/** "Done by" picker for one service on the bill. */
function StaffSelect({ label, value, onChange, staff, preferred }: { label: string; value?: string; onChange: (id: string) => void; staff: BillStaff[]; preferred: string[] }) {
  const usual = staff.filter((s) => preferred.includes(s.name));
  const others = staff.filter((s) => !preferred.includes(s.name));
  return (
    <label className="mt-1.5 flex items-center gap-1.5 text-2xs">
      <UserRound className={cn('h-3.5 w-3.5 shrink-0', value ? 'text-primary' : 'text-warning')} />
      <span className="max-w-[45%] shrink-0 truncate text-muted-foreground">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Who did ${label}`}
        className={cn('h-6 min-w-0 flex-1 rounded-md border bg-card px-1.5 text-2xs font-medium outline-none focus:border-primary/50', value ? 'border-border text-foreground' : 'border-warning/50 text-warning')}
      >
        <option value="">Who did it?</option>
        {usual.length > 0 && <optgroup label="Does this service">{usual.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
        {(usual.length ? <optgroup label="Other staff">{others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup> : others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>))}
      </select>
    </label>
  );
}

function LineDiscount({ pct, onChange }: { pct: number; onChange: (pct: number) => void }) {
  const [value, setValue] = useState(String(pct || ''));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-2xs font-medium transition-colors', pct ? 'bg-success-soft text-success' : 'text-subtle hover:bg-surface hover:text-primary')}>
          <Percent className="h-3 w-3" /> {pct ? `${pct}% off` : 'Discount'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3">
        <p className="mb-2 text-xs font-medium">Line discount (%)</p>
        <div className="flex gap-1.5">
          {[5, 10, 15].map((p) => (
            <button key={p} type="button" onClick={() => { setValue(String(p)); onChange(p); }} className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium hover:border-primary hover:text-primary">
              {p}%
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onChange(Number(e.target.value) || 0);
          }}
          placeholder="Custom %"
          aria-label="Custom discount percent"
          className="mt-2 h-8 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] outline-none focus:border-primary/50"
        />
      </PopoverContent>
    </Popover>
  );
}

export function CartPanel({ state, dispatch, totals, onHold, onPay, showTradePrice, staff, serviceStaff, className }: CartPanelProps) {
  const [showNotes, setShowNotes] = useState(!!state.notes);
  const empty = state.lines.length === 0;

  return (
    <section className={cn('flex min-h-0 flex-col bg-card', className)} aria-label="Current bill">
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <ReceiptText className="h-4 w-4 text-primary" /> Current Bill
            {state.lines.length > 0 && <span className="rounded-full bg-primary-light px-2 py-0.5 text-2xs font-semibold text-primary">{state.lines.length} items</span>}
          </h2>
          {!empty && (
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'clear' })} className="text-danger hover:bg-danger-soft hover:text-danger">
              <X /> Clear
            </Button>
          )}
        </div>
        <CustomerPicker value={state.customer} onChange={(customer) => dispatch({ type: 'customer', customer })} />
        {showTradePrice && (
          <div className="flex rounded-lg border border-border bg-surface p-0.5 text-xs" role="radiogroup" aria-label="Price list">
            {(['retail', 'trade'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={(state.priceList ?? 'retail') === v}
                onClick={() => dispatch({ type: 'priceList', value: v })}
                className={cn('flex-1 rounded-md py-1.5 font-medium', (state.priceList ?? 'retail') === v ? 'bg-card text-primary shadow-card' : 'text-muted-foreground')}
              >
                {v === 'retail' ? 'Retail price' : 'Trade price'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-primary">
              <ShoppingCart className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[13px] font-semibold">No items yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Tap a product, scan a barcode or type a SKU and press Enter.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {state.lines.map((l) => {
              const lineTotal = l.price * l.qty * (1 - l.discountPct / 100);
              return (
                <li key={l.key} className="group px-4 py-3 animate-fade-in">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{l.name}</p>
                      <p className="text-2xs text-subtle">
                        {formatINR(l.price)}{l.kind === 'package' ? '' : ` · GST ${l.gstRate}%`}{l.stock !== undefined && l.qty * (l.stockFactor ?? 1) > l.stock ? <span className="text-danger"> · only {Number(l.stock.toFixed(3))} in stock</span> : null}
                      </p>
                      {l.contents && !(staff && l.serviceParts?.length) && <p className="line-clamp-2 text-2xs text-muted-foreground">Includes: {l.contents}</p>}
                      {l.serial && <p className="font-mono text-2xs text-muted-foreground">IMEI / S.No. {l.serial}</p>}
                      {staff && l.kind === 'service' && (
                        <StaffSelect label="Done by" value={l.staffId} onChange={(id) => dispatch({ type: 'staff', key: l.key, staffId: id })} staff={staff} preferred={serviceStaff?.(l.refId) ?? []} />
                      )}
                      {staff && l.kind === 'package' && l.serviceParts?.map((p) => (
                        <StaffSelect key={p.serviceId} label={p.name} value={l.partStaff?.[p.serviceId]} onChange={(id) => dispatch({ type: 'staff', key: l.key, staffId: id, serviceId: p.serviceId })} staff={staff} preferred={serviceStaff?.(p.serviceId) ?? []} />
                      ))}
                      {staff && (l.kind === 'service' || l.serviceParts?.length) && staff.length === 0 && <p className="mt-1 text-2xs text-muted-foreground">Add employees to choose who did it.</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'remove', key: l.key })}
                      className="rounded-md p-1 text-subtle opacity-60 transition hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                      aria-label={`Remove ${l.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-lg border border-border">
                        <button type="button" className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-primary" onClick={() => dispatch({ type: 'qty', key: l.key, qty: l.qty - 1 })} aria-label="Decrease quantity">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          value={l.qty}
                          onChange={(e) => dispatch({ type: 'qty', key: l.key, qty: Number(e.target.value.replace(l.allowDecimal ? /[^\d.]/g : /\D/g, '')) || 0 })}
                          onFocus={(e) => e.target.select()}
                          inputMode={l.allowDecimal ? 'decimal' : 'numeric'}
                          aria-label={`Quantity of ${l.name}`}
                          className="tabular h-7 w-14 border-x border-border bg-transparent text-center text-[13px] font-semibold outline-none focus:bg-primary-soft"
                        />
                        <button type="button" className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-primary" onClick={() => dispatch({ type: 'qty', key: l.key, qty: l.qty + 1 })} aria-label="Increase quantity">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <LineDiscount pct={l.discountPct} onChange={(pct) => dispatch({ type: 'discount', key: l.key, pct })} />
                    </div>
                    <span className="tabular text-[13px] font-semibold">{formatINR(lineTotal, true)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border bg-surface/40 p-4">
        {showNotes ? (
          <textarea
            value={state.notes}
            onChange={(e) => dispatch({ type: 'notes', notes: e.target.value.slice(0, 200) })}
            placeholder="Add a note for this bill (prints on invoice)"
            rows={2}
            aria-label="Bill notes"
            className="mb-3 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-xs outline-none focus:border-primary/50"
          />
        ) : null}

        <dl className="space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular">{formatINR(totals.subtotal, true)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-muted-foreground">
              Discount
              <span className="flex items-center rounded-md border border-border bg-card">
                <input
                  value={state.billDiscount.value || ''}
                  onChange={(e) => dispatch({ type: 'billDiscount', value: { ...state.billDiscount, value: Math.max(0, Number(e.target.value) || 0) } })}
                  placeholder="0"
                  inputMode="decimal"
                  aria-label="Bill discount"
                  className="tabular h-6 w-14 bg-transparent px-1.5 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'billDiscount', value: { ...state.billDiscount, type: state.billDiscount.type === 'flat' ? 'pct' : 'flat' } })}
                  className="border-l border-border px-1.5 text-2xs font-semibold text-primary"
                  aria-label="Toggle discount type"
                >
                  {state.billDiscount.type === 'flat' ? '₹' : '%'}
                </button>
              </span>
            </dt>
            <dd className="tabular text-success">− {formatINR(totals.discount, true)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tax (CGST + SGST)</dt>
            <dd className="tabular">{formatINR(totals.tax, true)}</dd>
          </div>
          {Math.abs(totals.roundOff) >= 0.01 && (
            <div className="flex justify-between text-xs">
              <dt className="text-subtle">Round off</dt>
              <dd className="tabular text-subtle">{totals.roundOff > 0 ? '+' : '−'} {formatINR(Math.abs(totals.roundOff), true)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-dashed border-border pt-2.5">
            <dt className="text-sm font-semibold">Grand Total</dt>
            <dd className="tabular text-[22px] font-semibold tracking-tight text-primary">{formatINR(totals.total)}</dd>
          </div>
        </dl>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={onHold} disabled={empty} title="Hold bill (F8)">
            <PauseCircle /> Hold
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowNotes((s) => !s)} aria-pressed={showNotes}>
            <StickyNote /> Notes
          </Button>
        </div>
        <Button size="lg" className="mt-2 h-12 w-full text-[15px]" onClick={onPay} disabled={empty}>
          Complete Payment · {formatINR(totals.total)}
          <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-2xs font-medium">F9</kbd>
        </Button>
      </div>
    </section>
  );
}
