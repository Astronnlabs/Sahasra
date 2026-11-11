import { cn } from '@/lib/utils';

/** The Sahaasra "S" mark (public/brand, made from public/logo_sahaasra.png). */
export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  const img = <img src="/brand/logo-192.png" alt="Sahaasra" draggable={false} className={cn('h-9 w-9 object-contain', !inverted && className)} />;
  // On the purple panels the purple mark sits on a white tile so it stays visible.
  if (inverted) {
    return <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1 shadow-sm [&>img]:h-full [&>img]:w-full', className)}>{img}</span>;
  }
  return img;
}

export function Logo({ className, collapsed, inverted }: { className?: string; collapsed?: boolean; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <LogoMark inverted={inverted} className="shrink-0" />
      {!collapsed && (
        <span className={cn('whitespace-nowrap text-[17px] font-bold tracking-[0.08em]', inverted ? 'text-white' : 'text-foreground')}>
          SAHAASRA
        </span>
      )}
    </span>
  );
}
