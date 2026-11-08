import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn, initials } from '@/lib/utils';

const PALETTE = [
  'bg-primary-light text-primary',
  'bg-[#E8F1FF] text-[#3A66D6] dark:bg-info-soft dark:text-info',
  'bg-[#E9F8F0] text-[#1C8A58] dark:bg-success-soft dark:text-success',
  'bg-[#FFF3E2] text-[#B5740B] dark:bg-warning-soft dark:text-warning',
  'bg-[#FCEBF3] text-[#B83A78] dark:bg-danger-soft dark:text-danger',
];

function tint(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-16 w-16 text-lg',
};

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full', SIZES[size], className)}>
      {src && <AvatarPrimitive.Image src={src} alt={name} className="h-full w-full object-cover" />}
      <AvatarPrimitive.Fallback className={cn('flex h-full w-full items-center justify-center font-semibold', tint(name))} delayMs={src ? 300 : 0}>
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
