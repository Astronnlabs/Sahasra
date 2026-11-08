import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-primary/30 focus:border-primary/60 focus:outline-none focus:ring-[3px] focus:ring-primary/12 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus:ring-danger/10';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, leftIcon, rightSlot, ...props }, ref) => {
  if (!leftIcon && !rightSlot) return <input ref={ref} className={cn(fieldBase, 'h-9 px-3', className)} {...props} />;
  return (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle [&_svg]:size-4">{leftIcon}</span>
      )}
      <input ref={ref} className={cn(fieldBase, 'h-9 px-3', leftIcon && 'pl-9', rightSlot && 'pr-10', className)} {...props} />
      {rightSlot && <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</span>}
    </div>
  );
});
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'min-h-[80px] resize-y px-3 py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';

/** Native select styled to match — fast, accessible and form-friendly. */
export const NativeSelect = forwardRef<HTMLSelectElement, InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        "h-9 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239A96A5%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_10px_center] bg-no-repeat pl-3 pr-8",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
NativeSelect.displayName = 'NativeSelect';
