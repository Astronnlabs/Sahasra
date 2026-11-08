import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { BUSINESS_TYPE_MAP } from '@/app/config/business';
import { cn } from '@/lib/utils';
import type { Tenant } from '@/types';

const SIZES = { sm: 'h-9 w-9 rounded-lg', lg: 'h-14 w-14 rounded-2xl' } as const;

/** The business's own logo, or its industry icon when none is uploaded (or it fails to load). */
export function BusinessAvatar({ tenant, size = 'sm', className }: { tenant: Pick<Tenant, 'logo' | 'type' | 'name'>; size?: keyof typeof SIZES; className?: string }) {
  const [broken, setBroken] = useState(false);
  const Icon = BUSINESS_TYPE_MAP[tenant.type]?.icon ?? Building2;
  if (tenant.logo && !broken) {
    return <img src={tenant.logo} alt={`${tenant.name} logo`} loading="lazy" onError={() => setBroken(true)} className={cn('shrink-0 border border-border bg-white object-contain p-0.5', SIZES[size], className)} />;
  }
  return (
    <span className={cn('flex shrink-0 items-center justify-center bg-primary-light text-primary', SIZES[size], className)}>
      <Icon className={size === 'lg' ? 'h-6 w-6' : 'h-4 w-4'} />
    </span>
  );
}
