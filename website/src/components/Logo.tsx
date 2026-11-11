/** The SAHAASRA "S" mark (public/brand). */
export function Logo({ className }: { className?: string }) {
  return <img src="/brand/logo-192.png" alt="" aria-hidden="true" draggable={false} className={`object-contain ${className ?? ''}`} />;
}
