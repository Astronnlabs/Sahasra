/** Astron Labs logo, the parent company. Dark text on light screens, light text in dark mode. */
export function AstronLabsLogo({ className, mark, white }: { className?: string; mark?: boolean; white?: boolean }) {
  const base = mark ? 'astron-labs-mark' : 'astron-labs';
  if (white) return <img src={`/brand/${base}-white.png`} alt="Astron Labs" className={`w-auto ${className ?? ''}`} />;
  return (
    <>
      <img src={`/brand/${base}.png`} alt="Astron Labs" className={`w-auto dark:hidden ${className ?? ''}`} />
      <img src={`/brand/${base}-light.png`} alt="Astron Labs" className={`hidden w-auto dark:block ${className ?? ''}`} />
    </>
  );
}

/** "A product of Astron Labs" */
export function AstronLabsCredit({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 ${className ?? ''}`}>
      A product of <AstronLabsLogo mark className="h-5" />
    </span>
  );
}
