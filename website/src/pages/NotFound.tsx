import { Link } from 'react-router-dom';
import { usePageTitle } from '../components/Layout';

export function NotFoundPage() {
  usePageTitle('Page not found · SAHAASRA');
  return (
    <section className="container-x py-24 text-center">
      <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">404</p>
      <h1 className="mt-2 text-3xl font-bold">This page doesn’t exist</h1>
      <p className="muted mt-3">The link may be old or mistyped.</p>
      <Link to="/" className="btn btn-primary mt-8">Go to the home page</Link>
    </section>
  );
}
