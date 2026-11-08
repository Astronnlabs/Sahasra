import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { buildNavigation, type NavGroup, type NavItem } from '@/app/config/navigation';
import { useWorkspace } from '@/app/providers/WorkspaceProvider';
import { Tooltip } from '@/components/ui/tooltip';
import { usePageAccess } from '@/hooks/usePageAccess';
import { cn } from '@/lib/utils';
import { Logo, LogoMark } from './Logo';

function useNavigation() {
  const { businessType } = useWorkspace();
  const { allowed, can } = usePageAccess();
  return useMemo(
    () =>
      buildNavigation(businessType, allowed)
        .map((g) => ({ ...g, items: g.items.filter((i) => can(i.page)) }))
        .filter((g) => g.items.length > 0),
    [businessType, allowed, can],
  );
}

function CompactItem({ item }: { item: NavItem }) {
  return (
    <Tooltip content={item.label} side="right">
      {/* Wrapper keeps Radix Slot from merging into NavLink's function className */}
      <span className="block">
      <NavLink
        to={item.to}
        end={item.end}
        aria-label={item.label}
        className={({ isActive }) =>
          cn(
            'group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150',
            isActive ? 'bg-primary text-white shadow-primary' : 'text-muted-foreground hover:bg-primary-light hover:text-primary',
          )
        }
      >
        <item.icon className="h-[19px] w-[19px]" strokeWidth={1.85} />
      </NavLink>
      </span>
    </Tooltip>
  );
}

function ExpandedItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors duration-150',
          isActive ? 'bg-primary text-white shadow-primary' : 'text-muted-foreground hover:bg-primary-light hover:text-primary',
        )
      }
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.85} />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

export function NavGroups({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Collapsible.Root key={g.id} open={!closed[g.id]} onOpenChange={(open) => setClosed((c) => ({ ...c, [g.id]: !open }))}>
          <Collapsible.Trigger className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-left">
            <span className="section-label">{g.label}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-subtle transition-transform', closed[g.id] && '-rotate-90')} />
          </Collapsible.Trigger>
          <Collapsible.Content className="space-y-0.5 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
            {g.items.map((item) => (
              <ExpandedItem key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </Collapsible.Content>
        </Collapsible.Root>
      ))}
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, update } = useWorkspace();
  const groups = useNavigation();
  const collapsed = sidebarCollapsed;

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-300 ease-out lg:flex',
        collapsed ? 'w-[84px]' : 'w-[244px]',
      )}
      aria-label="Primary"
    >
      <div className={cn('flex h-16 shrink-0 items-center', collapsed ? 'justify-center' : 'px-5')}>
        <NavLink to="/dashboard" aria-label="Sahasra home">
          {collapsed ? <LogoMark /> : <Logo />}
        </NavLink>
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {collapsed ? (
          <div className="flex flex-col items-center">
            {groups.map((g, gi) => (
              <div key={g.id} className="flex flex-col items-center gap-1.5">
                {gi > 0 && <div className="my-2.5 h-px w-8 bg-border" role="separator" />}
                {g.items.map((item) => (
                  <CompactItem key={item.to} item={item} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <NavGroups groups={groups} />
        )}
      </nav>

      <div className={cn('shrink-0 border-t border-border p-3', collapsed && 'flex justify-center')}>
        <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
          <button
            type="button"
            onClick={() => update({ sidebarCollapsed: !collapsed })}
            className={cn(
              'flex h-10 items-center gap-3 rounded-xl text-muted-foreground transition-colors hover:bg-surface hover:text-foreground',
              collapsed ? 'w-10 justify-center' : 'w-full px-3 text-[13px] font-medium',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
            {!collapsed && 'Collapse'}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}

export { useNavigation };
