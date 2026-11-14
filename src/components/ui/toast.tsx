import { Toaster as SonnerToaster, toast } from 'sonner';
import { useTheme } from '@/app/providers/ThemeProvider';

export { toast };

export function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      offset={20}
      // Every notification can be closed with ×.
      closeButton
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !border !border-border !bg-card !text-foreground !shadow-pop !font-sans',
          description: '!text-muted-foreground',
          actionButton: '!bg-primary !text-white',
          closeButton: '!left-auto !right-0 !translate-x-[35%] !-translate-y-[35%] !h-6 !w-6 !border-border !bg-card !text-muted-foreground hover:!text-foreground',
        },
      }}
    />
  );
}
