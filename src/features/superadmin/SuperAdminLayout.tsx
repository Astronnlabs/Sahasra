import { useQuery } from '@tanstack/react-query';
import { Building2, Gift, Headset, LayoutDashboard, LogOut, Menu, Moon, ShieldCheck, Sun, TrendingUp, UsersRound, type LucideIcon } from 'lucide-react';
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { PageSkeleton } from '@/components/feedback/PageSkeleton';
import { Logo } from '@/components/layout/Logo';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ticketsService } from '@/services';
import { PK } from './platformKeys';

const NAV: { label: string; to: string; icon: LucideIcon; end?: boolean; badge?: 'tickets' }[] = [
  { label: 'Overview', to: '/superadmin', icon: LayoutDashboard, end: true },
  { label: 'Businesses', to: '/superadmin/businesses', icon: Building2 },
  { label: 'Users', to: '/superadmin/users', icon: UsersRound },
  { label: 'Support', to: '/superadmin/support', icon: Headset, badge: 'tickets' },
  { label: 'Growth & sign-ups', to: '/superadmin/growth', icon: TrendingUp },
  { label: 'Referrals', to: '/superadmin/referrals', icon: Gift },
];

function NavItems({ onNavigate, openTickets }: { onNavigate?: () => void; openTickets: number }) {
  return (
    <nav className="space-y-0.5" aria-label="Super Admin">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn('flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors', isActive ? 'bg-primary text-white shadow-primary' : 'text-muted-foreground hover:bg-primary-light hover:text-primary')
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{item.label}</span>
              {item.badge === 'tickets' && openTickets > 0 && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-2xs font-semibold', isActive ? 'bg-white/20 text-white' : 'bg-danger-soft text-danger')}>{openTickets}</span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function SuperAdminLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const { data: tickets } = useQuery({ queryKey: PK.tickets, queryFn: ticketsService.list, refetchInterval: 10_000 });
  const openTickets = tickets?.filter((t) => t.status === 'open').length ?? 0;

  const brand = (
    <div className="flex min-w-0 items-center gap-2">
      <Logo />
      <Badge tone="primary" className="mt-0.5 shrink-0"><ShieldCheck /> Admin</Badge>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center px-5">{brand}</div>
        <div className="flex-1 px-3 pt-2">
          <p className="section-label mb-2 px-3">Platform</p>
          <NavItems openTickets={openTickets} />
        </div>
        <div className="m-3 rounded-xl bg-primary-soft p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Sahaasra Platform Console</p>
          Manage every business, user and support request.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/85 px-4 backdrop-blur-md md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu /></Button>
          <span className="lg:hidden">{brand}</span>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun /> : <Moon />}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ml-1 flex items-center gap-2 rounded-full p-0.5 hover:ring-4 hover:ring-primary-light" aria-label="Account menu">
                <Avatar name={user?.name ?? 'Admin'} size="sm" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <div className="px-2.5 py-2">
                <p className="text-[13px] font-semibold">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={async () => { await logout(); navigate('/login', { replace: true }); }}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 px-4 pb-12 pt-6 md:px-6 lg:px-8 lg:pt-7">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <div key={location.pathname} className="mx-auto max-w-[1440px] animate-fade-in">
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <Drawer open={navOpen} onOpenChange={setNavOpen} side="left" title={brand}>
        <div className="-mx-3"><NavItems onNavigate={() => setNavOpen(false)} openTickets={openTickets} /></div>
      </Drawer>
    </div>
  );
}
