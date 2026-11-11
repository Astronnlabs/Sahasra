import { Building2, Clock, Mail, MapPin, Phone, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePageTitle } from '../components/Layout';
import { AstronLabsLogo } from '../components/AstronLabs';
import { PageHead } from '../components/Section';
import { COMPANY, telHref } from '../config';

export function ContactPage() {
  usePageTitle('Contact SAHAASRA');
  return (
    <>
      <PageHead title="Contact us">We’re happy to help with sign-up, plans, payments and using SAHAASRA.</PageHead>
      <section className="container-x grid gap-5 py-12 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-lg font-semibold">Support</h2>
          <dl className="mt-4 space-y-4">
            <Row icon={<Mail />} label="Email"><a className="text-brand-600 hover:underline dark:text-brand-300" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></Row>
            <Row icon={<Phone />} label="Phone / WhatsApp"><a className="text-brand-600 hover:underline dark:text-brand-300" href={telHref(COMPANY.phone)}>{COMPANY.phone}</a></Row>
            <Row icon={<Clock />} label="Hours">{COMPANY.hours}</Row>
          </dl>
        </div>
        <div className="card p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">Company</h2>
            <AstronLabsLogo mark className="h-7" />
          </div>
          <dl className="mt-4 space-y-4">
            <Row icon={<Building2 />} label="Name">{COMPANY.legalName} (makers of {COMPANY.name})</Row>
            <Row icon={<MapPin />} label="Registered address">{COMPANY.address}</Row>
            {COMPANY.gstin && <Row icon={<Receipt />} label="GSTIN">{COMPANY.gstin}</Row>}
          </dl>
        </div>
      </section>
    </>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-brand-600 dark:text-brand-300 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <div>
        <dt className="muted text-sm">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}
