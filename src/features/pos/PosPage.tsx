import { useQuery } from '@tanstack/react-query';
import { Check, Gift, History, Keyboard, Package, PlayCircle, ScanBarcode, Search, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRANCHES } from '@/app/config/constants';
import { industryConfig, PRICE_UNIT_LABEL } from '@/app/config/industry';
import { useAuth } from '@/app/providers/AuthProvider';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { qk, useAppMutation, useProducts } from '@/hooks/queries';
import { useHotkey } from '@/hooks/useHotkey';
import { formatINR, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { billStaffService, catalogServicesService, packagesService, productsService, salesService, workspaceService } from '@/services';
import type { PaymentMethod, Product } from '@/types';
import { CartPanel } from './CartPanel';
import { OptionPicker } from './OptionPicker';
import { PaymentModal } from './PaymentModal';
import { isSerialTracked, SerialPicker, serialLine } from './SerialPicker';
import { lineDiscount, usePosCart, type CartLine } from './usePosCart';

type Tab = 'product' | 'service' | 'package';
type NewLine = Omit<CartLine, 'key' | 'qty' | 'discountPct' | 'price'>;
interface CatalogItem {
  refId: string;
  kind: Tab;
  name: string;
  sku: string;
  category: string;
  barcode?: string;
  price: number;
  /** Shown under the price: stock left, "per page", what a package includes… */
  note?: string;
  noteTone?: 'danger' | 'warning';
  product?: Product;
  /** Picture on the tile (product photo or service picture). */
  image?: string;
  line: NewLine;
}

export function PosPage() {
  const { branch, businessType, settings } = useWorkspace();
  const { hasPermission, refresh } = useAuth();
  const cfg = industryConfig(businessType);
  const navigate = useNavigate();
  const { data: products, isLoading } = useProducts();
  const { data: services } = useQuery({ queryKey: qk.services, queryFn: catalogServicesService.list });
  const { data: packages } = useQuery({ queryKey: qk.packages, queryFn: packagesService.list });
  // Salons: who gave each service is picked on the bill.
  const staffOnBill = !!cfg.services.staffOnBill;
  const { data: staff } = useQuery({ queryKey: ['pos', 'staff'], queryFn: billStaffService.list, enabled: staffOnBill });
  const cart = usePosCart();
  const { state, dispatch, totals } = cart;

  const [tab, setTab] = useState<Tab | null>(null);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [payOpen, setPayOpen] = useState(false);
  const [payTotal, setPayTotal] = useState(0);
  const [payCustomer, setPayCustomer] = useState(state.customer);
  const [cartOpen, setCartOpen] = useState(false);
  const [picking, setPicking] = useState<Product | null>(null);
  const [pickingSerial, setPickingSerial] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const all = useMemo<CatalogItem[]>(() => {
    const goods = (products ?? [])
      // In-house items (salon shampoo, wax) are used up by services, never sold.
      .filter((p) => p.status === 'active' && !p.inHouse)
      .map<CatalogItem>((p) => {
        const out = p.soldOut || (!p.isSelfProduct && p.stock <= 0);
        return {
          refId: p.id,
          kind: 'product',
          name: p.name,
          sku: p.sku,
          category: p.category,
          barcode: p.barcode,
          price: p.sellingPrice,
          note: p.soldOut ? 'Out of stock' : p.isSelfProduct ? (p.options.length ? p.options.map((o) => o.name).join(' / ') : undefined) : out ? 'Out of stock' : `${Number(p.stock.toFixed(3))} ${p.unit.toLowerCase()} left`,
          noteTone: out ? 'danger' : !p.isSelfProduct && p.stock <= p.minStock ? 'warning' : undefined,
          product: p,
          image: p.image || undefined,
          line: { refId: p.id, kind: 'product', name: p.name, sku: p.sku, hsn: p.hsn, retailPrice: p.sellingPrice, tradePrice: p.tradePrice, gstRate: p.gstRate, stock: p.isSelfProduct ? undefined : p.stock, stockFactor: 1, allowDecimal: p.allowDecimalQty },
        };
      });
    const svc = (services ?? [])
      .filter((s) => s.status === 'active')
      .map<CatalogItem>((s) => ({
        refId: s.id,
        kind: 'service',
        name: s.name,
        sku: s.sac,
        category: s.category,
        price: s.price,
        note: s.priceUnit !== 'service' ? PRICE_UNIT_LABEL[s.priceUnit] : s.durationMins ? `${s.durationMins} min` : cfg.services.singular,
        image: s.image || undefined,
        line: { refId: s.id, kind: 'service', name: s.name, sku: s.sac, hsn: s.sac, retailPrice: s.price, tradePrice: 0, gstRate: s.gstRate, allowDecimal: ['hour', 'day'].includes(s.priceUnit) },
      }));
    const pkgs = (packages ?? [])
      .filter((p) => p.status === 'active')
      .map<CatalogItem>((p) => {
        const contents = p.items.map((i) => (i.qty > 1 ? `${i.name} × ${i.qty}` : i.name)).join(' + ');
        return {
          refId: p.id,
          kind: 'package',
          name: p.name,
          sku: '',
          category: p.category,
          price: p.price,
          note: contents,
          // Tax is split by each part's own GST rate on the server; this is only an estimate for the screen.
          line: {
            refId: p.id, kind: 'package', name: p.name, sku: '', hsn: '', retailPrice: p.price, tradePrice: 0, gstRate: estimateGst(p.items, products ?? [], services ?? []), contents,
            ...(staffOnBill ? { serviceParts: p.items.filter((i) => i.kind === 'service').map((i) => ({ serviceId: i.refId, name: i.qty > 1 ? `${i.name} × ${i.qty}` : i.name })) } : {}),
          },
        };
      });
    return [...goods, ...svc, ...pkgs];
  }, [products, services, packages, cfg.services.singular, staffOnBill]);

  // The business chooses which tab opens first; salons start on services.
  const firstTab: Tab = settings.posFirstTab ?? (staffOnBill ? 'service' : 'product');
  const allTabs = useMemo(
    () =>
      [
        { id: 'product', label: cfg.goods.title, icon: Package },
        { id: 'service', label: cfg.services.title, icon: Sparkles },
        { id: 'package', label: cfg.packages.title, icon: Gift },
      ] as const,
    [cfg],
  );
  const tabs = useMemo(() => {
    // Products always; services always for service businesses like salons; others once they have items.
    const list = allTabs.filter((t) => t.id === 'product' || t.id === firstTab || (t.id === 'service' && staffOnBill) || all.some((c) => c.kind === t.id));
    return [...list.filter((t) => t.id === firstTab), ...list.filter((t) => t.id !== firstTab)];
  }, [allTabs, all, firstTab, staffOnBill]);
  const activeTab = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const catalog = useMemo(() => all.filter((c) => c.kind === activeTab), [all, activeTab]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(catalog.map((c) => c.category)))], [catalog]);

  const visible = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    // While searching, look across every tab.
    const pool = q ? all : catalog;
    return pool.filter(
      (c) =>
        (q || category === 'All' || c.category === category) &&
        (!q || c.name.toLowerCase().includes(q) || c.sku.toLowerCase().includes(q) || c.barcode?.toLowerCase() === q),
    );
  }, [all, catalog, category, deferred]);

  const add = (item: CatalogItem) => {
    if (item.product?.soldOut) {
      toast.error(`${item.name} is marked out of stock`, { description: 'Turn it back on from the menu when it is available.' });
      return;
    }
    if (isSerialTracked(item.product)) {
      setPickingSerial(item.product!);
      return;
    }
    if (item.product && (item.product.options.length || item.product.addons.length)) {
      setPicking(item.product);
      return;
    }
    if (item.product && !item.product.isSelfProduct && item.product.stock <= 0) {
      toast.warning(`${item.name} is out of stock`, { description: 'Added anyway — stock will go negative until the next purchase.' });
    }
    dispatch({ type: 'add', line: item.line });
  };

  const addBySerial = async (q: string, fallback?: CatalogItem) => {
    const found = await productsService.lookupSerial(q).catch(() => null);
    const product = found?.productId ? products?.find((p) => p.id === found.productId) : undefined;
    if (found && product && found.status === 'in_stock') {
      if (state.lines.some((l) => l.serial === found.serial)) toast.info(`${found.serial} is already on this bill`);
      else dispatch({ type: 'add', line: serialLine(product, found.serial) });
      setQuery('');
    } else if (found) {
      toast.error(`${found.serial} (${found.productName}) is ${found.status === 'sold' ? `already sold${found.invoiceNo ? ` on ${found.invoiceNo}` : ''}` : 'not in stock'}.`);
    } else if (fallback) {
      add(fallback);
      setQuery('');
    } else {
      toast.error(`Nothing matches “${q}”`);
    }
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = query.trim().toLowerCase();
      const exact = all.find((c) => (c.sku && c.sku.toLowerCase() === q) || (c.barcode && c.barcode.toLowerCase() === q));
      const target = exact ?? visible[0];
      if (exact) {
        add(exact);
        setQuery('');
      } else if (/^[A-Za-z0-9/-]{6,30}$/.test(q) && products?.some(isSerialTracked)) {
        // A scanned IMEI / serial adds that exact unit.
        void addBySerial(q, target);
      } else if (target) {
        add(target);
        setQuery('');
      } else if (q) {
        toast.error(`Nothing matches “${query.trim()}”`);
      }
    }
    if (e.key === 'Escape') setQuery('');
  };

  const checkout = useAppMutation(
    ({ method }: { method: PaymentMethod }) =>
      // The server re-prices every line from the catalogue and computes tax and totals.
      salesService.checkout({
        customerId: payCustomer.id,
        customerName: payCustomer.name,
        items: state.lines.map((l) => ({
          ...(l.kind === 'product' ? { productId: l.refId } : l.kind === 'service' ? { serviceId: l.refId } : { packageId: l.refId }),
          option: l.option,
          addons: l.addons ?? [],
          serials: l.serial ? [l.serial] : [],
          name: l.name,
          qty: l.qty,
          discount: lineDiscount(l),
          ...(staffOnBill && l.kind === 'service' && l.staffId ? { staffId: l.staffId } : {}),
          ...(staffOnBill && l.kind === 'package' && l.partStaff ? { staffFor: l.partStaff } : {}),
        })),
        billDiscount: Math.round(totals.billDiscount * 100) / 100,
        priceList: state.priceList ?? 'retail',
        payment: method,
        branch: BRANCHES.find((b) => b.id === branch)?.name ?? 'Main Branch',
        notes: state.notes || undefined,
      }),
    { invalidate: [qk.sales, qk.products, qk.customers, qk.inventory, qk.notifications, ['dashboard']] },
  );

  const setFirst = useAppMutation(
    async (t: Tab) => {
      await workspaceService.updateSettings({ posFirstTab: t });
      await refresh();
      return t;
    },
    {
      invalidate: [],
      success: (t) => `${allTabs.find((x) => x.id === t)?.label ?? 'This tab'} now opens first`,
      onSuccess: (t) => setTab(t),
    },
  );

  const openPayment = () => {
    if (!state.lines.length) return;
    setPayTotal(totals.total);
    setPayCustomer(state.customer);
    setCartOpen(false);
    setPayOpen(true);
  };

  const hold = async () => {
    const bill = await cart.hold();
    if (bill) toast.success(`Bill held as “${bill.label}”`, { description: 'Resume it any time from Held bills.' });
  };

  useHotkey('/', (e) => {
    e.preventDefault();
    searchRef.current?.focus();
  });
  useHotkey('F9', (e) => {
    e.preventDefault();
    openPayment();
  }, { allowInInputs: true });
  useHotkey('F8', (e) => {
    e.preventDefault();
    hold();
  }, { allowInInputs: true });

  const cartPanelProps = {
    state,
    dispatch,
    totals,
    onHold: hold,
    onPay: openPayment,
    showTradePrice: !!cfg.goods.features.tradePrice,
    staff: staffOnBill ? staff ?? [] : undefined,
    serviceStaff: (id: string) => services?.find((s) => s.id === id)?.staff ?? [],
  };
  const current = tabs.find((t) => t.id === activeTab)!;
  const emptyFor: Record<Tab, { title: string; text: string; to: string }> = {
    product: { title: `No ${cfg.goods.title.toLowerCase()} yet.`, text: cfg.goods.emptyText, to: '/products?new=1' },
    service: { title: `No ${cfg.services.title.toLowerCase()} yet.`, text: cfg.services.emptyText, to: '/services' },
    package: { title: `No ${cfg.packages.title.toLowerCase()} yet.`, text: cfg.packages.emptyText, to: '/packages' },
  };

  return (
    <div className="flex lg:h-[calc(100vh-4rem)]">
      {/* Catalogue */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-3 border-b border-border bg-card/60 px-4 py-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Search, scan barcode or enter SKU…"
                aria-label="Search items, barcode or SKU"
                className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-24 text-[14px] outline-none transition-[border-color,box-shadow] placeholder:text-subtle focus:border-primary/60 focus:ring-[3px] focus:ring-primary/12"
                autoFocus
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="rounded-md p-1.5 text-subtle hover:text-foreground" aria-label="Clear search">
                    <X className="h-4 w-4" />
                  </button>
                )}
                <span className="hidden items-center gap-1 rounded-md bg-surface px-2 py-1 text-2xs font-medium text-muted-foreground sm:flex">
                  <ScanBarcode className="h-3.5 w-3.5" /> Scan
                </span>
              </div>
            </div>
            <HeldBills held={cart.held} onResume={cart.resume} onDiscard={cart.discardHeld} />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary" size="icon" className="hidden h-11 w-11 md:inline-flex" aria-label="Keyboard shortcuts">
                  <Keyboard />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-3 text-xs">
                {[
                  ['/', 'Focus search'],
                  ['Enter', 'Add first match / exact SKU'],
                  ['F8', 'Hold bill'],
                  ['F9', 'Complete payment'],
                  ['Esc', 'Clear search'],
                ].map(([k, l]) => (
                  <div key={k} className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground">{l}</span>
                    <kbd className="rounded border border-border bg-surface px-1.5 font-sans">{k}</kbd>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-3">
            {tabs.length > 1 && (
              <div className="flex shrink-0 rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label="Catalogue">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={activeTab === t.id}
                    onClick={() => {
                      setTab(t.id);
                      setCategory('All');
                    }}
                    className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all', activeTab === t.id ? 'bg-card text-primary shadow-card' : 'text-muted-foreground')}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {hasPermission('Settings', 'edit') && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="shrink-0 text-subtle" aria-label="Choose which tab opens first" title="Choose which tab opens first"><Settings2 /></Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-60 p-3">
                  <p className="text-xs font-semibold">Show first on POS</p>
                  <p className="mb-2 text-2xs text-muted-foreground">For everyone in your business.</p>
                  <div className="space-y-1">
                    {allTabs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFirst.mutate(t.id)}
                        disabled={setFirst.isPending}
                        className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors', firstTab === t.id ? 'bg-primary-light text-primary' : 'hover:bg-surface')}
                      >
                        <t.icon className="h-3.5 w-3.5" /> {t.label}
                        {firstTab === t.id && <Check className="ml-auto h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <div className="scrollbar-none -mr-4 flex gap-1.5 overflow-x-auto pr-4 md:mr-0 md:pr-0" role="tablist" aria-label="Categories">
              {categories.map((c) => (
                <button
                  key={c}
                  role="tab"
                  aria-selected={category === c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                    category === c ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto p-4 pb-28 md:p-6 lg:pb-6">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 15 }, (_, i) => (
                <Skeleton key={i} className="h-[132px] rounded-2xl" />
              ))}
            </div>
          ) : catalog.length === 0 && !deferred.trim() ? (
            <EmptyState
              icon={current.icon}
              title={emptyFor[activeTab].title}
              description={emptyFor[activeTab].text}
              actionLabel={`Add ${activeTab === 'product' ? cfg.goods.singular : activeTab === 'service' ? cfg.services.singular : cfg.packages.singular}`}
              onAction={() => navigate(emptyFor[activeTab].to)}
            />
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <Search className="h-8 w-8 text-subtle" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium">Nothing matches “{query}”</p>
              <p className="mt-1 text-xs text-muted-foreground">Check the spelling, or scan the barcode again.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visible.map((item) => {
                const inCart = state.lines.filter((l) => l.refId === item.refId).reduce((s, l) => s + l.qty, 0);
                return (
                  <li key={`${item.kind}-${item.refId}`}>
                    <button
                      type="button"
                      onClick={() => add(item)}
                      className={cn(
                        'group relative flex h-full w-full flex-col rounded-2xl border bg-card p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card active:scale-[0.98]',
                        inCart ? 'border-primary/50 ring-2 ring-primary/10' : 'border-border',
                        item.product?.soldOut && 'opacity-55 grayscale',
                      )}
                    >
                      {inCart > 0 && (
                        <span className="absolute right-2.5 top-2.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold text-white animate-fade-in">
                          {Number(inCart.toFixed(3))}
                        </span>
                      )}
                      {item.image ? (
                        <span className="relative -mx-1.5 -mt-1.5 block">
                          <img src={item.image} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-xl bg-surface object-cover" />
                          {item.product && <span className="absolute left-1.5 top-1.5 rounded bg-white/90"><FoodMark type={item.product.attributes?.foodType} /></span>}
                        </span>
                      ) : (
                      <span className="flex items-center gap-1.5">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-[13px] font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                          {item.kind === 'package' ? <Gift className="h-4 w-4" /> : item.name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('')}
                        </span>
                        <FoodMark type={item.product?.attributes?.foodType} />
                      </span>
                      )}
                      <span className="mt-3 line-clamp-2 min-h-[2.4em] text-[13px] font-medium leading-tight">{item.name}</span>
                      <span className="mt-auto flex items-end justify-between gap-1 pt-2">
                        <span className="tabular text-[15px] font-semibold">{formatINR(item.price)}</span>
                        {item.note && (
                          <span className={cn('line-clamp-1 max-w-[60%] text-right text-2xs font-medium', item.noteTone === 'danger' ? 'text-danger' : item.noteTone === 'warning' ? 'text-warning' : 'text-subtle')} title={item.note}>
                            {item.note}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Bill — desktop */}
      <CartPanel {...cartPanelProps} className="hidden w-[400px] shrink-0 border-l border-border lg:flex xl:w-[420px]" />

      {/* Bill — mobile */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden">
        <Button size="lg" className="h-12 w-full justify-between" onClick={() => setCartOpen(true)}>
          <span>View bill · {state.lines.length} items</span>
          <span className="tabular">{formatINR(totals.total)}</span>
        </Button>
      </div>
      <Drawer open={cartOpen} onOpenChange={setCartOpen} side="bottom" title="Current bill" className="h-[88vh]">
        <CartPanel {...cartPanelProps} className="-mx-6 -my-5 h-[calc(88vh-70px)]" />
      </Drawer>

      <OptionPicker
        product={picking}
        optionLabel={cfg.goods.features.options?.label ?? 'Options'}
        onClose={() => setPicking(null)}
        onAdd={(line) => {
          dispatch({ type: 'add', line });
          setPicking(null);
        }}
      />

      <SerialPicker
        product={pickingSerial}
        taken={state.lines.flatMap((l) => (l.serial ? [l.serial] : []))}
        onClose={() => setPickingSerial(null)}
        onAdd={(lines) => {
          lines.forEach((line) => dispatch({ type: 'add', line }));
          setPickingSerial(null);
        }}
      />

      <PaymentModal
        open={payOpen}
        onOpenChange={setPayOpen}
        total={payTotal}
        customer={payCustomer}
        onComplete={async (method) => {
          const sale = await checkout.mutateAsync({ method });
          dispatch({ type: 'clear' });
          return sale;
        }}
        onNewBill={() => searchRef.current?.focus()}
      />
    </div>
  );
}

/** Indian veg / non-veg mark for restaurant items. */
export function FoodMark({ type }: { type: unknown }) {
  if (type !== 'Veg' && type !== 'Non-veg' && type !== 'Egg') return null;
  const color = type === 'Veg' ? '#1f9d55' : type === 'Egg' ? '#d69e2e' : '#c53030';
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-[3px] border-[1.5px]" style={{ borderColor: color }} title={type} aria-label={type}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

/** Weighted GST of a package's parts, for the on-screen estimate only. */
function estimateGst(items: { kind: string; refId: string; qty: number }[], products: Product[], services: { id: string; price: number; gstRate: number }[]) {
  let value = 0;
  let tax = 0;
  for (const i of items) {
    const p = i.kind === 'product' ? products.find((x) => x.id === i.refId) : undefined;
    const s = i.kind === 'service' ? services.find((x) => x.id === i.refId) : undefined;
    const price = (p?.sellingPrice ?? s?.price ?? 0) * i.qty;
    value += price;
    tax += (price * (p?.gstRate ?? s?.gstRate ?? 0)) / 100;
  }
  return value > 0 ? (tax / value) * 100 : 0;
}

function HeldBills({ held, onResume, onDiscard }: { held: ReturnType<typeof usePosCart>['held']; onResume: (id: string) => void; onDiscard: (id: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" className="relative h-11" aria-label={`Held bills (${held.length})`}>
          <History /> <span className="hidden sm:inline">Held bills</span>
          {held.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold text-white">{held.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2">
        <p className="px-2 pb-2 pt-1 text-xs font-semibold">Held bills</p>
        {held.length === 0 ? (
          <p className="px-2 pb-3 text-xs text-muted-foreground">No bills on hold. Press F8 to park the current bill.</p>
        ) : (
          <ul className="space-y-1">
            {held.map((b) => {
              const total = b.state.lines.reduce((s, l) => s + l.price * l.qty, 0);
              return (
                <li key={b.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{b.label}</p>
                    <p className="text-2xs text-muted-foreground">
                      {b.state.lines.length} items · ~{formatINR(total)} · {timeAgo(b.heldAt)}
                    </p>
                  </div>
                  <Button variant="soft" size="sm" onClick={() => onResume(b.id)}>
                    <PlayCircle /> Resume
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => onDiscard(b.id)} aria-label={`Discard ${b.label}`}>
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
