import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../components/Layout';
import { PageHead } from '../components/Section';
import { COMPANY, telHref } from '../config';

const UPDATED = '11 November 2026';

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(`${title} · SAHAASRA`);
  return (
    <>
      <PageHead title={title}>Last updated: {UPDATED}</PageHead>
      <section className="container-x prose-legal max-w-3xl py-10">{children}</section>
    </>
  );
}

const Email = () => <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>;
const Phone = () => <a href={telHref(COMPANY.phone)}>{COMPANY.phone}</a>;

export function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>These terms apply when you use the SAHAASRA billing software and website, provided by {COMPANY.legalName} (“SAHAASRA”, “we”). By creating an account you agree to them.</p>
      <h2>Your account</h2>
      <ul>
        <li>You must give correct business and contact details when you sign up.</li>
        <li>Keep your password safe. You are responsible for what is done with your account and your staff logins.</li>
        <li>You must be allowed to run the business you register, and to issue the bills you create.</li>
      </ul>
      <h2>Plans and payment</h2>
      <ul>
        <li>The software is available while your plan is active. Plans are monthly, quarterly or yearly, at the prices shown on our pricing page at the time you pay.</li>
        <li>Payments are processed by PayU. We do not see or store your card or bank details.</li>
        <li>A plan is not renewed automatically. When it ends, the software stays locked until you renew; your data is kept.</li>
        <li>WhatsApp e-bills are an optional service through VAAHAK and are charged from your VAAHAK wallet under VAAHAK’s terms.</li>
      </ul>
      <h2>Your data</h2>
      <p>Your business data belongs to you. We store it to provide the service, as described in our <Link to="/privacy">privacy policy</Link>. You can export your data from the software at any time.</p>
      <h2>Fair use</h2>
      <p>Do not use SAHAASRA for anything unlawful, to issue false invoices, or to try to break into or overload the service. We may suspend accounts that do.</p>
      <h2>Tax and accuracy</h2>
      <p>SAHAASRA helps you calculate GST and prepare reports, but you are responsible for the tax rates you set and for your filings. Please check reports with your accountant.</p>
      <h2>Service and liability</h2>
      <p>We work to keep SAHAASRA available and secure, but we cannot promise it will never be interrupted. To the extent the law allows, our liability is limited to the amount you paid for your current plan.</p>
      <h2>Changes</h2>
      <p>We may update these terms. If the change is important, we will tell you in the software before it applies.</p>
      <h2>Contact</h2>
      <p>Questions about these terms: <Email />. These terms are governed by the laws of India.</p>
    </LegalPage>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>This policy explains what information {COMPANY.legalName} (“SAHAASRA”, “we”) collects when you use our website and billing software, and how we use it.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, business name and type, city, mobile number, email and a securely hashed password.</li>
        <li><strong>Business data you enter:</strong> products, bills, customers, vendors, staff, expenses and settings.</li>
        <li><strong>Payment records:</strong> plan, amount, date and PayU’s reference. Card, UPI and bank details are handled by PayU and never reach us.</li>
        <li><strong>Technical data:</strong> sign-in times, device type and IP address, used for security.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To run the software for you and keep your account secure.</li>
        <li>To process plan payments and keep payment records.</li>
        <li>To contact you about your account, plan and support requests.</li>
      </ul>
      <h2>Sharing</h2>
      <p>We do not sell your data. We share it only with services that help us run SAHAASRA (PayU for payments, and VAAHAK if you connect it for WhatsApp e-bills), or when the law requires it.</p>
      <h2>Security and storage</h2>
      <p>Data is sent over encrypted connections and stored on our own secured server with nightly backups. Passwords are hashed and connection keys are encrypted. We keep your data while your account exists and as required by law for tax records.</p>
      <h2>Your choices</h2>
      <p>You can view, correct and export your data in the software. To close your account and delete your data, write to <Email />.</p>
      <h2>Contact</h2>
      <p>
        {COMPANY.legalName}, {COMPANY.address}. Email <Email />.
      </p>
    </LegalPage>
  );
}

export function RefundPage() {
  return (
    <LegalPage title="Refund and cancellation policy">
      <h2>Plans</h2>
      <p>SAHAASRA plans are prepaid for the period you choose (monthly, quarterly or yearly). Plans do not renew automatically, so there is nothing to cancel: if you don’t renew, the plan simply ends at the end of its period.</p>
      <h2>Refunds</h2>
      <ul>
        <li>Payments for a plan that has started are not refundable, except as below.</li>
        <li>If you were charged twice for the same plan, or charged but your plan was not activated, we will refund the extra or failed payment in full.</li>
        <li>Write to <Email /> within 7 days of the payment with your PayU reference (shown on the plan page in the software).</li>
        <li>Approved refunds are sent back to the original payment method through PayU within 5 to 7 working days.</li>
      </ul>
      <h2>Failed payments</h2>
      <p>If money was taken but the payment failed, it is usually returned automatically by your bank or PayU within 5 to 7 working days. If not, contact us with the reference and we will help.</p>
      <h2>WhatsApp e-bills</h2>
      <p>E-bill charges are taken from your VAAHAK wallet. A bill WhatsApp could not deliver is refunded to that wallet automatically.</p>
      <h2>Contact</h2>
      <p>
        Email <Email /> or call <Phone />.
      </p>
    </LegalPage>
  );
}
