export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#6d3de8" />
      <path
        d="M27 13.2c-1.6-1.9-4-3-6.9-3-4.2 0-7 2.2-7 5.4 0 3.4 2.9 4.4 6.5 5.1l1.5.3c2.6.5 3.9 1.2 3.9 2.7 0 1.6-1.7 2.6-4.3 2.6-2.4 0-4.3-.9-5.6-2.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="28.4" cy="28.6" r="2.1" fill="rgba(255,255,255,.55)" />
    </svg>
  );
}
