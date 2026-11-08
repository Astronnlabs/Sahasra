import { Bell, CreditCard, Database, FileText, Gift, MessageCircle, Palette, Printer, ShieldCheck, ShoppingCart, Store, Wallet, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';
import { EBillingSection } from './EBillingSection';
import { PrinterSettings } from './PrinterSettings';
import { WalletSection } from './WalletSection';
import { ReferSection } from './ReferSection';
import { Appearance, Backup, BusinessProfile, InvoiceSettings, NotificationSettings, PaymentMethods, PosSettings, Security } from './SettingsSections';

/** `support`: set up by the Sahasra team (shown only in support mode), not by the business. */
const SECTIONS: { id: string; label: string; icon: LucideIcon; render: () => ReactNode; support?: boolean }[] = [
  { id: 'profile', label: 'Business Profile', icon: Store, render: () => <BusinessProfile /> },
  { id: 'invoice', label: 'Invoice Settings', icon: FileText, render: () => <InvoiceSettings /> },
  { id: 'pos', label: 'Billing & POS', icon: ShoppingCart, render: () => <PosSettings />, support: true },
  { id: 'payments', label: 'Payments', icon: CreditCard, render: () => <PaymentMethods />, support: true },
  { id: 'ebilling', label: 'E-Billing (WhatsApp)', icon: MessageCircle, render: () => <EBillingSection /> },
  { id: 'wallet', label: 'Wallet', icon: Wallet, render: () => <WalletSection /> },
  { id: 'printer', label: 'Printer', icon: Printer, render: () => <PrinterSettings /> },
  { id: 'notifications', label: 'Notifications', icon: Bell, render: () => <NotificationSettings /> },
  { id: 'security', label: 'Security', icon: ShieldCheck, render: () => <Security /> },
  { id: 'appearance', label: 'Appearance', icon: Palette, render: () => <Appearance /> },
  { id: 'backup', label: 'Your data', icon: Database, render: () => <Backup /> },
  { id: 'refer', label: 'Refer & Earn', icon: Gift, render: () => <ReferSection /> },
];

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const { impersonating } = useAuth();
  const sections = SECTIONS.filter((s) => !s.support || impersonating);
  const active = sections.find((s) => s.id === params.get('section')) ?? sections[0];

  return (
    <>
      <PageHeader title="Settings" description="Configure your business, billing, tax and workspace." />
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Settings sections" className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:h-fit lg:flex-col lg:gap-0.5 lg:px-0">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setParams({ section: s.id }, { replace: true })}
              aria-current={active.id === s.id ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                active.id === s.id ? 'bg-primary-light text-primary' : 'text-muted-foreground hover:bg-card hover:text-foreground',
              )}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          ))}
        </nav>
        <div key={active.id} className="min-w-0">{active.render()}</div>
      </div>
    </>
  );
}
