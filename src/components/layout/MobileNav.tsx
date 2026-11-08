import { LayoutDashboard, LayoutGrid, Package, ReceiptText, ShoppingCart } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Drawer } from '@/components/ui/dialog';
import { usePageAccess } from '@/hooks/usePageAccess';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { NavGroups, useNavigation } from './Sidebar';

const TABS = [
  { label: 'Home', to: '/dashboard', icon: LayoutDashboard, page: 'dashboard' },
  { label: 'POS', to: '/pos', icon: ShoppingCart, page: 'pos' },
  { label: 'Sales', to: '/sales', icon: ReceiptText, page: 'sales' },
  { label: 'Products', to: '/products', icon: Package, page: 'products' },
];

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const { can } = usePageAccess();
  const tabs = TABS.filter((t) => can(t.page));
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label="Mobile"
    >
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn('flex flex-col items-center justify-center gap-1 text-2xs font-medium transition-colors', isActive ? 'text-primary' : 'text-muted-foreground')
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-primary-light')}>
                  <t.icon className="h-[18px] w-[18px]" />
                </span>
                {t.label}
              </>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={onMore} className="flex flex-col items-center justify-center gap-1 text-2xs font-medium text-muted-foreground">
          <span className="flex h-7 w-12 items-center justify-center rounded-full">
            <LayoutGrid className="h-[18px] w-[18px]" />
          </span>
          More
        </button>
      </div>
    </nav>
  );
}

export function MobileNavDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const groups = useNavigation();
  return (
    <Drawer open={open} onOpenChange={onOpenChange} side="left" title={<Logo />} className="max-w-[300px]">
      <nav aria-label="All modules" className="-mx-3">
        <NavGroups groups={groups} onNavigate={() => onOpenChange(false)} />
      </nav>
    </Drawer>
  );
}
