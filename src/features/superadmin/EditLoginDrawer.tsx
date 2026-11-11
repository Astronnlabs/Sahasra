import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/forms/FormField';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAppMutation } from '@/hooks/queries';
import { sanitizeText } from '@/lib/sanitize';
import { platformUsersService } from '@/services';
import type { PlatformUser } from '@/types';
import { PK } from './platformKeys';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(60),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/, 'Enter a valid 10-digit mobile number'),
  password: z
    .string()
    .refine((p) => p === '' || (p.length >= 8 && p.length <= 128 && /[A-Za-z]/.test(p) && /\d/.test(p)), '8+ characters with letters and numbers'),
});
type Values = z.infer<typeof schema>;

/** Super Admin: change any business user's name, login (email / mobile) and password. */
export function EditLoginDrawer({ user, onClose }: { user: PlatformUser | null; onClose: () => void }) {
  const [show, setShow] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (user) reset({ name: user.name, email: user.email, phone: user.phone, password: '' });
    setShow(false);
  }, [user, reset]);
  const save = useAppMutation(
    (v: Values) => platformUsersService.updateLogin(user!.id, { name: sanitizeText(v.name, 60), email: v.email, phone: v.phone, ...(v.password ? { password: v.password } : {}) }),
    {
      invalidate: [PK.all],
      success: (u) => `${u.name}’s login updated`,
      onSuccess: () => onClose(),
    },
  );
  const submit = handleSubmit((v) => save.mutate(v));

  return (
    <Drawer
      open={!!user}
      onOpenChange={(o) => !o && onClose()}
      title="Edit login"
      description={user ? `${user.role} at ${user.tenantName}. They sign in with this email or mobile number.` : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}><Save /> Save changes</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit} noValidate>
        <FormField label="Full name" error={errors.name?.message} required><Input {...register('name')} /></FormField>
        <FormField label="Email (login)" error={errors.email?.message} required><Input {...register('email')} type="email" autoComplete="off" /></FormField>
        <FormField label="Mobile (login)" error={errors.phone?.message} required><Input {...register('phone')} inputMode="tel" autoComplete="off" /></FormField>
        <FormField label="New password" error={errors.password?.message} hint="Leave empty to keep the current password. 8+ characters, letters and numbers.">
          <Input
            {...register('password')}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            rightSlot={
              <button type="button" onClick={() => setShow((s) => !s)} className="rounded-md p-1.5 text-subtle hover:text-foreground" aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
        </FormField>
        <p className="rounded-xl bg-surface px-3 py-2.5 text-xs text-muted-foreground">
          Changing the email, mobile or password signs this user out on all devices. Tell them their new login.
        </p>
      </form>
    </Drawer>
  );
}
