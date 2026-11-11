import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Eye, EyeOff, Lock, Mail, MapPin, Moon, Phone, Sun, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { BUSINESS_TYPES } from '@/app/config/business';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { FormField } from '@/components/forms/FormField';
import { AstronLabsCredit } from '@/components/layout/AstronLabs';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { ApiError } from '@/services';
import type { BusinessType } from '@/types';
import { AuthShowcase } from './AuthShowcase';

/** Plan picked on the website's pricing page, opened after sign-up. */
export const PLAN_CHOICE_KEY = 'sahaasra:plan-choice';

const schema = z
  .object({
    businessName: z.string().trim().min(2, 'Enter your business name').max(80),
    type: z.string().min(1, 'Choose your business type'),
    city: z.string().trim().min(1, 'Enter your city').max(60),
    ownerName: z.string().trim().min(2, 'Enter your name').max(60),
    phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/, 'Enter a valid 10-digit mobile number'),
    email: z.string().trim().email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .max(128)
      .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Use letters and numbers'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

type FormValues = z.infer<typeof schema>;

/** Public sign-up: creates the business and its owner login, then opens the plan page. */
export function SignupPage() {
  const { signup } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { businessName: '', type: '', city: '', ownerName: '', phone: '', email: '', password: '', confirm: '' },
  });
  const { errors, isSubmitting } = form.formState;

  // Remember the plan chosen on the website (e.g. /signup?plan=build&period=yearly).
  useEffect(() => {
    const period = params.get('period');
    if (period && ['monthly', 'quarterly', 'yearly'].includes(period)) {
      try {
        sessionStorage.setItem(PLAN_CHOICE_KEY, JSON.stringify({ plan: params.get('plan') ?? 'build', period }));
      } catch {
        /* storage unavailable */
      }
    }
  }, [params]);

  const submit = form.handleSubmit(async ({ confirm: _confirm, ...v }) => {
    try {
      await signup({ ...v, type: v.type as BusinessType });
      toast.success(`Welcome to SAHAASRA, ${v.ownerName.split(' ')[0]}! Choose your plan to start.`);
      navigate('/subscription', { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign-up failed';
      const details = e instanceof ApiError ? (e.details as Record<string, string[]> | undefined) : undefined;
      if (details && typeof details === 'object') {
        for (const [field, list] of Object.entries(details)) {
          if (field in form.getValues()) form.setError(field as keyof FormValues, { message: list?.[0] ?? msg });
        }
      }
      if (/mobile/i.test(msg)) form.setError('phone', { message: msg });
      else if (/@|email/i.test(msg)) form.setError('email', { message: msg });
      else toast.error(msg);
    }
  });

  return (
    <div className="grid min-h-screen bg-background lg:h-screen lg:grid-cols-[1.05fr_1fr] lg:overflow-hidden">
      <AuthShowcase />

      <div className="relative flex flex-col lg:h-screen lg:overflow-y-auto">
        <div className="flex items-center justify-between p-5 sm:p-8 lg:absolute lg:right-0 lg:top-0 lg:p-6">
          <span className="lg:hidden">
            <Logo />
          </span>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>

        <main className="flex flex-1 items-center justify-center px-5 pb-10 sm:px-8 lg:py-8">
          <div className="w-full max-w-[480px] animate-fade-up">
            <div className="rounded-2xl border border-border bg-card p-7 shadow-card sm:p-8">
              <div className="mb-5">
                <Logo className="mb-5 hidden lg:inline-flex" />
                <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Create your account</h1>
                <p className="mt-1.5 text-[13.5px] text-muted-foreground">Set up your business on SAHAASRA. You’ll choose your plan next.</p>
              </div>

              <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
                <FormField label="Business name" error={errors.businessName?.message} required className="sm:col-span-2">
                  <Input {...form.register('businessName')} leftIcon={<Building2 />} placeholder="e.g. Sharma General Store" autoComplete="organization" autoFocus />
                </FormField>
                <FormField label="Business type" error={errors.type?.message} required>
                  <NativeSelect {...form.register('type')}>
                    <option value="">Choose…</option>
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="City" error={errors.city?.message} required>
                  <Input {...form.register('city')} leftIcon={<MapPin />} autoComplete="address-level2" />
                </FormField>
                <FormField label="Your name" error={errors.ownerName?.message} required className="sm:col-span-2">
                  <Input {...form.register('ownerName')} leftIcon={<User />} autoComplete="name" />
                </FormField>
                <FormField label="Mobile number" error={errors.phone?.message} required>
                  <Input {...form.register('phone')} leftIcon={<Phone />} inputMode="tel" placeholder="98200 11223" autoComplete="tel" />
                </FormField>
                <FormField label="Email" error={errors.email?.message} required>
                  <Input {...form.register('email')} leftIcon={<Mail />} type="email" autoComplete="email" />
                </FormField>
                <FormField label="Password" error={errors.password?.message} hint="8+ characters, letters and numbers." required>
                  <Input
                    {...form.register('password')}
                    leftIcon={<Lock />}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    rightSlot={
                      <button type="button" onClick={() => setShowPassword((s) => !s)} className="rounded-md p-1.5 text-subtle hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />
                </FormField>
                <FormField label="Confirm password" error={errors.confirm?.message} required>
                  <Input {...form.register('confirm')} leftIcon={<Lock />} type={showPassword ? 'text' : 'password'} autoComplete="new-password" />
                </FormField>

                <p className="text-xs text-muted-foreground sm:col-span-2">You’ll sign in with your mobile number or email and this password.</p>

                <Button type="submit" size="lg" className="w-full sm:col-span-2" loading={isSubmitting}>
                  Create account
                </Button>
              </form>
            </div>

            <p className="mt-6 text-center text-[13px] text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
            <div className="mt-6 flex justify-center lg:hidden">
              <AstronLabsCredit />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
