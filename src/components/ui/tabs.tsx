import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: 'pill' | 'underline' }>(
  ({ className, variant = 'pill', ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'scrollbar-none inline-flex max-w-full items-center overflow-x-auto',
        variant === 'pill' ? 'gap-1 rounded-xl border border-border bg-surface p-1' : 'w-full gap-5 border-b border-border',
        className,
      )}
      data-variant={variant}
      {...props}
    />
  ),
);
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-muted-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
        // pill
        '[[data-variant=pill]_&]:h-7 [[data-variant=pill]_&]:rounded-lg [[data-variant=pill]_&]:px-3 [[data-variant=pill]_&]:hover:text-foreground [[data-variant=pill]_&]:data-[state=active]:bg-card [[data-variant=pill]_&]:data-[state=active]:text-foreground [[data-variant=pill]_&]:data-[state=active]:shadow-card',
        // underline
        '[[data-variant=underline]_&]:-mb-px [[data-variant=underline]_&]:border-b-2 [[data-variant=underline]_&]:border-transparent [[data-variant=underline]_&]:pb-2.5 [[data-variant=underline]_&]:pt-1 [[data-variant=underline]_&]:hover:text-foreground [[data-variant=underline]_&]:data-[state=active]:border-primary [[data-variant=underline]_&]:data-[state=active]:text-primary',
        className,
      )}
      {...props}
    />
  ),
);
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Content ref={ref} className={cn('mt-5 animate-fade-in focus-visible:outline-none', className)} {...props} />
  ),
);
TabsContent.displayName = 'TabsContent';
