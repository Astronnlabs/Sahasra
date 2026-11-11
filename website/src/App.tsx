import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ContactPage } from './pages/Contact';
import { HomePage } from './pages/Home';
import { NotFoundPage } from './pages/NotFound';
import { PricingPage } from './pages/Pricing';
import { PrivacyPage, RefundPage, TermsPage } from './pages/Legal';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="refund" element={<RefundPage />} />
        <Route path="*" element={<OldLinkOrNotFound />} />
      </Route>
    </Routes>
  );
}

/** Links from the old website (pricing.html, index.html) open the new pages. */
function OldLinkOrNotFound() {
  const { pathname } = useLocation();
  const m = pathname.match(/^\/([a-z]+)\.html$/);
  if (m) return <Navigate to={m[1] === 'index' ? '/' : `/${m[1]}`} replace />;
  return <NotFoundPage />;
}
