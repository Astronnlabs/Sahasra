import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { PageSkeleton } from '@/components/feedback/PageSkeleton';
import { SearchCommand } from '@/components/common/SearchCommand';
import { Modal } from '@/components/ui/dialog';
import { AssistantWidget } from '@/features/assistant/AssistantWidget';
import { EbillPdfSender } from '@/features/sales/EbillPdfSender';
import { useHotkey } from '@/hooks/useHotkey';
import { cn } from '@/lib/utils';
import { MobileBottomNav, MobileNavDrawer } from './MobileNav';
import { AccessGate } from './AccessGate';
import { PrintJobIndicator } from './PrintJobIndicator';
import { Sidebar } from './Sidebar';
import { SupportModeBanner } from './SupportModeBanner';
import { Topbar } from './Topbar';

const SHORTCUTS: [string, string][] = [
  ['Ctrl + K', 'Search everything'],
  ['/', 'Focus search (POS)'],
  ['F9', 'Complete payment (POS)'],
  ['F8', 'Hold current bill (POS)'],
  ['Esc', 'Close dialogs'],
  ['?', 'Show keyboard shortcuts'],
];

/** Routes that use the full canvas without page padding. */
const FULL_BLEED = ['/pos', '/bill-studio', '/restaurant/kitchen'];

export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const location = useLocation();
  const fullBleed = FULL_BLEED.some((p) => location.pathname.startsWith(p));

  useHotkey('k', (e) => {
    e.preventDefault();
    setSearchOpen((o) => !o);
  }, { ctrl: true, allowInInputs: true });
  useHotkey('?', () => setShortcutsOpen(true));

  return (
    <div className="flex min-h-screen bg-background">
      <a href="#main" className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <SupportModeBanner />
        <Topbar onOpenSearch={() => setSearchOpen(true)} onOpenMobileNav={() => setNavOpen(true)} onOpenShortcuts={() => setShortcutsOpen(true)} />
        <main id="main" className={cn('flex-1 pb-24 lg:pb-10', !fullBleed && 'px-4 pt-6 md:px-6 lg:px-8 lg:pt-7')}>
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<div className={cn(fullBleed && 'p-6')}><PageSkeleton /></div>}>
              <div key={location.pathname} className={cn('animate-fade-in', !fullBleed && 'mx-auto max-w-[1440px]')}>
                <AccessGate>
                  <Outlet />
                </AccessGate>
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <MobileBottomNav onMore={() => setNavOpen(true)} />
      <MobileNavDrawer open={navOpen} onOpenChange={setNavOpen} />
      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
      {!fullBleed && <AssistantWidget />}
      <PrintJobIndicator />
      <EbillPdfSender />

      <Modal open={shortcutsOpen} onOpenChange={setShortcutsOpen} title="Keyboard shortcuts" description="Work faster across Sahaasra." size="sm">
        <ul className="divide-y divide-border pb-2">
          {SHORTCUTS.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between py-2.5 text-[13px]">
              <span className="text-muted-foreground">{label}</span>
              <kbd className="rounded-md border border-border bg-surface px-2 py-0.5 font-sans text-xs font-medium">{key}</kbd>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
