import { cn } from '@/lib/utils';

/** "A product of Astron Labs", the parent company. `white` is for the purple brand panels. */
export function AstronLabsCredit({ className, white, size = 'sm' }: { className?: string; white?: boolean; size?: 'sm' | 'md' }) {
  const h = size === 'md' ? 'h-6' : 'h-[18px]';
  return (
    <a
      href="https://sahaasra.in"
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-2 text-[11.5px] font-medium', white ? 'text-white/70' : 'text-muted-foreground', className)}
      title="SAHAASRA is a product of Astron Labs"
    >
      <span className="whitespace-nowrap">A product of</span>
      {white ? (
        <img src="/brand/astron-labs-mark-white.png" alt="Astron Labs" className={cn(h, 'w-auto')} />
      ) : (
        <>
          <img src="/brand/astron-labs-mark.png" alt="Astron Labs" className={cn(h, 'w-auto dark:hidden')} />
          <img src="/brand/astron-labs-mark-light.png" alt="Astron Labs" className={cn(h, 'hidden w-auto dark:block')} />
        </>
      )}
    </a>
  );
}
