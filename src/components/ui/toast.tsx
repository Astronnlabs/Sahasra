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
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !border !border-border !bg-card !text-foreground !shadow-pop !font-sans',
          description: '!text-muted-foreground',
          actionButton: '!bg-primary !text-white',
        },
      }}
    />
  );
}
