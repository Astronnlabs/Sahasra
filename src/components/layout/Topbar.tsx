import {
  Building2,
  CalendarDays,
  Check,
  ChevronsUpDown,
  CircleHelp,
  Gift,
  Keyboard,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Store,
  Sun,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUSINESS_TYPE_MAP } from '@/app/config/business';
import { useAuth } from '@/app/providers/AuthProvider';
import { cn } from '@/lib/utils';
import { useTheme } from '@/app/providers/ThemeProvider';
import { DATE_RANGES, useWorkspace, type DateRangeKey } from '@/app/providers/WorkspaceProvider';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { BRANCHES } from '@/app/config/constants';
import { LogoMark } from './Logo';
import { NotificationsPopover } from './NotificationsPopover';
import { PrinterStatus } from './PrinterStatus';
import { REFERRAL_REWARD } from '@/features/referrals/referralMeta';
import { usePageAccess } from '@/hooks/usePageAccess';

const BRANCH_OPTIONS = [{ value: 'all', label: 'All Branches' }, ...BRANCHES.map((b) => ({ value: b.id, label: b.name }))];

function BusinessSwitcher() {
  const { businessName, businessType, logo } = useWorkspace();
  const navigate = useNavigate();
  const TypeIcon = BUSINESS_TYPE_MAP[businessType]?.icon ?? Store;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logo]);
  const showLogo = !!logo && !broken;
  // The business's own logo when uploaded (Settings → Business Profile), else its industry icon.
  const Icon = ({ className }: { className?: string }) =>
    showLogo ? <img src={logo} alt="" onError={() => setBroken(true)} className={cn('rounded object-contain', className)} /> : <TypeIcon className={className} />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-10 items-center gap-2.5 rounded-xl px-2 text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {showLogo ? (
            <Icon className="h-8 w-8 shrink-0 rounded-lg border border-border bg-white p-0.5" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[160px] truncate text-[13px] font-semibold leading-tight">{businessName}</span>
            <span className="block text-2xs text-muted-foreground">{BUSINESS_TYPE_MAP[businessType]?.label} workspace</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-subtle" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your business</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => navigate('/settings?section=profile')}>
          <Icon className="h-4 w-4" />
          <span className="flex-1">
            <span className="block">{businessName}</span>
            <span className="block text-2xs text-muted-foreground">{BUSINESS_TYPE_MAP[businessType]?.label} · business profile</span>
          </span>
          <Check className="!text-primary" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const name = user?.name ?? 'Owner';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="ml-1 flex items-center gap-2 rounded-full p-0.5 transition-shadow hover:ring-4 hover:ring-primary-light focus-visible:ring-2 focus-visible:ring-primary/40" aria-label="Account menu">
          <Avatar name={name} size="sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <Avatar name={name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings?section=profile')}>
          <UserRound /> My profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings?section=branches')}>
          <Building2 /> Branches
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TopbarProps {
  onOpenSearch: () => void;
  onOpenMobileNav: () => void;
  onOpenShortcuts: () => void;
}

export function Topbar({ onOpenSearch, onOpenMobileNav, onOpenShortcuts }: TopbarProps) {
  const { branch, dateRange, update } = useWorkspace();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { can } = usePageAccess();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/75">
      <div className="flex h-16 items-center gap-2 px-4 md:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
          <Menu />
        </Button>
        <span className="lg:hidden">
          <LogoMark className="h-8 w-8" />
        </span>

        <BusinessSwitcher />

        <div className="mx-1 hidden h-6 w-px bg-border xl:block" />

        <div className="hidden items-center gap-2 xl:flex">
          <Select value={branch} onValueChange={(v) => update({ branch: v })} options={BRANCH_OPTIONS} icon={<Building2 />} ariaLabel="Branch" />
          <Select
            value={dateRange}
            onValueChange={(v) => update({ dateRange: v as DateRangeKey })}
            options={DATE_RANGES}
            icon={<CalendarDays />}
            ariaLabel="Date range"
          />
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-border bg-surface/70 px-3 text-[13px] text-subtle transition-colors hover:border-primary/30 hover:bg-card md:flex xl:w-72"
          aria-label="Search everything"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search customers, invoices…</span>
          <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 font-sans text-2xs font-medium text-muted-foreground">Ctrl K</kbd>
        </button>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenSearch} aria-label="Search">
          <Search className="!size-[18px]" />
        </Button>

        {can('settings') && (
          <Tooltip content={`Refer a business, get ${REFERRAL_REWARD}`}>
            <Button variant="ghost" size="sm" className="hidden gap-1.5 text-primary sm:inline-flex" onClick={() => navigate('/settings?section=refer')}>
              <Gift className="!size-[17px]" /> <span className="hidden lg:inline">Refer</span>
            </Button>
          </Tooltip>
        )}
        <PrinterStatus />
        <NotificationsPopover />

        <Tooltip content={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="!size-[18px]" /> : <Moon className="!size-[18px]" />}
          </Button>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Help">
              <CircleHelp className="!size-[18px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuItem onSelect={onOpenShortcuts}>
              <Keyboard /> Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/support')}>
              <LifeBuoy /> Contact support
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <UserMenu />
      </div>
    </header>
  );
}
