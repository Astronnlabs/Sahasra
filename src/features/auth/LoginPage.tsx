import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, Lock, Mail, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { FormField } from '@/components/forms/FormField';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { authService } from '@/services';
import { AuthShowcase } from './AuthShowcase';

const schema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Enter your email or mobile number')
    .refine((v) => z.string().email().safeParse(v).success || /^(\+91[\s-]?)?[6-9]\d{9}$/.test(v.replace(/\s/g, '')), {
      message: 'Enter a valid email or 10-digit mobile number',
    }),
  password: z.string().min(1, 'Enter your password'),
  remember: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

/** Passwords are reset by a person with authority — there is no self-service email reset. */
function ForgotPasswordModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Forgot your password?" size="sm" footer={<Button onClick={() => onOpenChange(false)}>Got it</Button>}>
      <div className="space-y-3 pb-2 text-[13px] text-muted-foreground">
        <p className="flex gap-2.5">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <b className="text-foreground">Staff members:</b> ask your business owner or admin to reset your password from <b>Users</b>. You’ll get a temporary password to sign in with.
          </span>
        </p>
        <p className="flex gap-2.5">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <b className="text-foreground">Business owners:</b> contact Sahaasra support. After verifying your identity, we’ll issue a temporary password.
          </span>
        </p>
        <p>Change the temporary password from Settings → Security after signing in.</p>
      </div>
    </Modal>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const { data: setup } = useQuery({ queryKey: ['auth', 'setup'], queryFn: authService.setupStatus, staleTime: 0 });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '', remember: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { user } = await login(values);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      const isAdmin = user.role === 'Super Admin';
      const from = (location.state as { from?: string } | null)?.from;
      const allowed = from && from !== '/login' && from.startsWith('/superadmin') === isAdmin;
      navigate(allowed ? from : isAdmin ? '/superadmin' : '/dashboard', { replace: true });
    } catch (err) {
      setError('password', { message: err instanceof Error ? err.message : 'Unable to sign in' });
    }
  });

  // A fresh installation has no platform owner yet.
  if (setup?.needsSetup) return <Navigate to="/setup" replace />;

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <AuthShowcase />

      <div className="relative flex flex-col">
        <div className="flex items-center justify-between p-5 sm:p-8">
          <span className="lg:invisible">
            <Logo />
          </span>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>

        <main className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
          <div className="w-full max-w-[420px] animate-fade-up">
            <div className="rounded-2xl border border-border bg-card p-7 shadow-card sm:p-9">
              <div className="mb-7">
                <Logo className="mb-7 hidden lg:inline-flex" />
                <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Welcome back</h1>
                <p className="mt-1.5 text-[13.5px] text-muted-foreground">Sign in to continue managing your business.</p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <FormField label="Email / Mobile Number" error={errors.identifier?.message}>
                  <Input {...register('identifier')} leftIcon={<Mail />} placeholder="you@business.in or 98200 11223" autoComplete="username" className="h-10" autoFocus />
                </FormField>

                <FormField
                  label="Password"
                  error={errors.password?.message}
                  action={
                    <button type="button" onClick={() => setForgotOpen(true)} className="text-xs font-medium text-primary hover:underline">
                      Forgot password?
                    </button>
                  }
                >
                  <Input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    leftIcon={<Lock />}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="h-10"
                    rightSlot={
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="rounded-md p-1.5 text-subtle hover:text-foreground"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />
                </FormField>

                <div className="flex items-center gap-2 pt-0.5">
                  <Checkbox id="remember" checked={watch('remember')} onCheckedChange={(c) => setValue('remember', c === true)} />
                  <Label htmlFor="remember" className="font-normal text-muted-foreground">
                    Keep me signed in on this device
                  </Label>
                </div>

                <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
                  Sign In
                </Button>
              </form>
            </div>

            <p className="mt-6 text-center text-[13px] text-muted-foreground">
              New to Sahaasra?{' '}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                Create your account
              </Link>
            </p>
          </div>
        </main>
      </div>

      <ForgotPasswordModal open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  );
}
