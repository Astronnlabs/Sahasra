import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useReducer } from 'react';
import { toast } from '@/components/ui/toast';
import { heldBillsService, type HeldBill as ServerHeldBill } from '@/services';

export interface CartLine {
  key: string;
  refId: string;
  kind: 'product' | 'service' | 'package';
  name: string;
  sku: string;
  hsn: string;
  /** Price used on this bill (retail or trade). */
  price: number;
  /** Retail price incl. chosen option and add-ons. */
  retailPrice: number;
  /** Trade price incl. add-ons; 0 when the item has none. */
  tradePrice: number;
  qty: number;
  gstRate: number;
  /** Line discount in percent. */
  discountPct: number;
  stock?: number;
  /** Base units of stock used per 1 qty (option factor). */
  stockFactor?: number;
  /** Quantity can have decimals (sold loose). */
  allowDecimal?: boolean;
  option?: string;
  addons?: string[];
  /** For packages: what's inside, for display. */
  contents?: string;
  /** IMEI / serial of the exact unit sold (one unit per line). */
  serial?: string;
  /** Salons: employee who gave this service. */
  staffId?: string;
  /** Salons, packages: the services inside, and who gave each (by service id). */
  serviceParts?: { serviceId: string; name: string }[];
  partStaff?: Record<string, string>;
}

export interface CartCustomer {
  id?: string;
  name: string;
  phone?: string;
  outstanding?: number;
}

export interface CartState {
  lines: CartLine[];
  customer: CartCustomer;
  billDiscount: { type: 'flat' | 'pct'; value: number };
  notes: string;
  /** Trade (contractor / wholesale) prices for this bill. */
  priceList?: 'retail' | 'trade';
}

export type HeldBill = ServerHeldBill<CartState>;

export const WALK_IN: CartCustomer = { name: 'Walk-in Customer' };

const HELD_KEY = ['pos', 'held'];


const EMPTY: CartState = { lines: [], customer: WALK_IN, billDiscount: { type: 'flat', value: 0 }, notes: '', priceList: 'retail' };

/**
 * Same item with the same option and add-ons stacks on one line. A service or package that
 * already has its staff chosen starts a new line, so the next one can be done by someone else.
 */
const signature = (l: Pick<CartLine, 'refId' | 'kind' | 'option' | 'addons' | 'serial' | 'staffId' | 'partStaff'>) =>
  [l.kind, l.refId, l.option ?? '', l.serial ?? '', l.staffId ?? '', Object.values(l.partStaff ?? {}).join(','), ...(l.addons ?? []).slice().sort()].join('|');
const priceFor = (l: Pick<CartLine, 'retailPrice' | 'tradePrice'>, list: CartState['priceList']) => (list === 'trade' && l.tradePrice > 0 ? l.tradePrice : l.retailPrice);
const roundQty = (q: number) => Math.round(q * 1000) / 1000;

export type CartAction =
  | { type: 'add'; line: Omit<CartLine, 'key' | 'qty' | 'discountPct' | 'price'>; qty?: number }
  | { type: 'priceList'; value: 'retail' | 'trade' }
  | { type: 'qty'; key: string; qty: number }
  | { type: 'discount'; key: string; pct: number }
  | { type: 'remove'; key: string }
  | { type: 'staff'; key: string; staffId: string; serviceId?: string }
  | { type: 'customer'; customer: CartCustomer }
  | { type: 'billDiscount'; value: CartState['billDiscount'] }
  | { type: 'notes'; notes: string }
  | { type: 'load'; state: CartState }
  | { type: 'clear' };

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const add = action.qty ?? 1;
      const existing = state.lines.find((l) => signature(l) === signature(action.line));
      if (existing) {
        // A unit identified by its IMEI can only be on the bill once.
        if (existing.serial) return state;
        return { ...state, lines: state.lines.map((l) => (l === existing ? { ...l, qty: roundQty(l.qty + add) } : l)) };
      }
      return { ...state, lines: [...state.lines, { ...action.line, price: priceFor(action.line, state.priceList), qty: add, discountPct: 0, key: `${action.line.refId}-${action.line.serial ?? ''}-${Date.now()}` }] };
    }
    case 'qty':
      return {
        ...state,
        lines: action.qty <= 0 ? state.lines.filter((l) => l.key !== action.key) : state.lines.map((l) => (l.key === action.key && !l.serial ? { ...l, qty: Math.min(99999, l.allowDecimal ? roundQty(action.qty) : Math.round(action.qty)) } : l)),
      };
    case 'discount':
      return { ...state, lines: state.lines.map((l) => (l.key === action.key ? { ...l, discountPct: Math.min(100, Math.max(0, action.pct)) } : l)) };
    case 'remove':
      return { ...state, lines: state.lines.filter((l) => l.key !== action.key) };
    case 'staff':
      return {
        ...state,
        lines: state.lines.map((l) => {
          if (l.key !== action.key) return l;
          if (!action.serviceId) return { ...l, staffId: action.staffId || undefined };
          const partStaff = { ...(l.partStaff ?? {}) };
          if (action.staffId) partStaff[action.serviceId] = action.staffId;
          else delete partStaff[action.serviceId];
          return { ...l, partStaff };
        }),
      };
    case 'customer':
      return { ...state, customer: action.customer };
    case 'billDiscount':
      return { ...state, billDiscount: action.value };
    case 'notes':
      return { ...state, notes: action.notes };
    case 'priceList':
      return { ...state, priceList: action.value, lines: state.lines.map((l) => ({ ...l, price: priceFor(l, action.value) })) };
    case 'load':
      // Bills held before options existed have no retail/trade prices.
      return { ...EMPTY, ...action.state, lines: action.state.lines.map((l) => ({ ...l, retailPrice: l.retailPrice ?? l.price, tradePrice: l.tradePrice ?? 0 })) };
    case 'clear':
      return EMPTY;
  }
}

export function computeTotals(state: CartState) {
  const gross = state.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const lineDiscount = state.lines.reduce((s, l) => s + (l.price * l.qty * l.discountPct) / 100, 0);
  const afterLine = gross - lineDiscount;
  const billDiscount = Math.max(0, Math.min(afterLine, state.billDiscount.type === 'pct' ? (afterLine * state.billDiscount.value) / 100 : state.billDiscount.value));
  const ratio = afterLine > 0 ? (afterLine - billDiscount) / afterLine : 1;
  const tax = state.lines.reduce((s, l) => s + l.price * l.qty * (1 - l.discountPct / 100) * ratio * (l.gstRate / 100), 0);
  const taxable = afterLine - billDiscount;
  const exact = taxable + tax;
  const total = Math.round(exact);
  return {
    items: state.lines.reduce((s, l) => s + l.qty, 0),
    subtotal: gross,
    discount: lineDiscount + billDiscount,
    billDiscount,
    taxable,
    tax,
    roundOff: total - exact,
    total,
  };
}

/** Line discount in rupees (paise precision), as sent to the server. */
export const lineDiscount = (l: CartLine) => Math.round(l.price * l.qty * l.discountPct) / 100;

export function usePosCart() {
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(reducer, EMPTY);
  // Held bills are stored on the server so they survive reloads and other counters can resume them.
  const { data: held = [] } = useQuery({ queryKey: HELD_KEY, queryFn: () => heldBillsService.list<CartState>() });
  const totals = useMemo(() => computeTotals(state), [state]);
  const refreshHeld = useCallback(() => qc.invalidateQueries({ queryKey: HELD_KEY }), [qc]);

  const hold = useCallback(async () => {
    if (state.lines.length === 0) return null;
    const label = state.customer.name === WALK_IN.name ? `Bill #${held.length + 1}` : state.customer.name;
    try {
      const bill = await heldBillsService.hold(label, state);
      dispatch({ type: 'clear' });
      refreshHeld();
      return bill;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not hold this bill.');
      return null;
    }
  }, [state, held.length, refreshHeld]);

  const resume = useCallback(
    async (id: string) => {
      const bill = held.find((b) => b.id === id);
      if (!bill) return;
      try {
        // Park the current bill first so nothing is lost.
        if (state.lines.length) await heldBillsService.hold(`Bill #${held.length + 1}`, state);
        await heldBillsService.remove(id);
        dispatch({ type: 'load', state: bill.state });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not resume this bill.');
      } finally {
        refreshHeld();
      }
    },
    [held, state, refreshHeld],
  );

  const discardHeld = useCallback(
    async (id: string) => {
      await heldBillsService.remove(id).catch(() => toast.error('Could not discard this bill.'));
      refreshHeld();
    },
    [refreshHeld],
  );

  return { state, dispatch, totals, held, hold, resume, discardHeld };
}