import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ME_KEY } from '@/app/providers/AuthProvider';
import { FullScreenLoader } from '@/components/feedback/PageSkeleton';
import { FormField } from '@/components/forms/FormField';
import { AstronLabsCredit } from '@/components/layout/AstronLabs';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { authService } from '@/services';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name').max(60),
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

/** First-run: creates the platform owner (Super Admin). Only works while no owner exists. */
export function SetupPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isPending } = useQuery({ queryKey: ['auth', 'setup'], queryFn: authService.setupStatus, staleTime: 0 });
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '', confirm: '' } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ name, email, password }) => {
    try {
      await authService.setup({ name, email, password });
      qc.setQueryData(ME_KEY, await authService.me());
      qc.setQueryData(['auth', 'setup'], { needsSetup: false });
      toast.success('Platform owner account created');
      navigate('/superadmin', { replace: true });
    } catch (e) {
      form.setError('email', { message: e instanceof Error ? e.message : 'Setup failed' });
    }
  });

  if (isPending) return <FullScreenLoader />;
  if (!data?.needsSetup) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-[440px] animate-fade-up rounded-2xl border border-border bg-card p-7 shadow-card sm:p-9">
        <Logo className="mb-7" />
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.02em]">Set up SAHAASRA</h1>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          Create the platform owner account. You’ll use it to add businesses, manage their access and answer support requests.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <FormField label="Your name" error={errors.name?.message}>
            <Input {...form.register('name')} leftIcon={<User />} autoComplete="name" autoFocus />
          </FormField>
          <FormField label="Email" error={errors.email?.message}>
            <Input {...form.register('email')} leftIcon={<Mail />} type="email" autoComplete="email" />
          </FormField>
          <FormField label="Password" error={errors.password?.message} hint="At least 8 characters with letters and numbers.">
            <Input {...form.register('password')} leftIcon={<Lock />} type="password" autoComplete="new-password" />
          </FormField>
          <FormField label="Confirm password" error={errors.confirm?.message}>
            <Input {...form.register('confirm')} leftIcon={<Lock />} type="password" autoComplete="new-password" />
          </FormField>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Create owner account
          </Button>
        </form>
        <div className="mt-7 flex justify-center">
          <AstronLabsCredit />
        </div>
      </div>
    </div>
  );
}
