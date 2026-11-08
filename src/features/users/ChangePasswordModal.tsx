import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormField } from '@/components/forms/FormField';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { passwordSchema, setPasswordSchema } from '@/features/settings/passwordSchema';
import { useAppMutation } from '@/hooks/queries';
import { authService, usersService } from '@/services';
import type { AppUser } from '@/types';

type Values = z.infer<typeof setPasswordSchema>;

/**
 * Changes a password. `direct` (owner): set the new password for anyone, no current password.
 * Otherwise the signed-in user changes their own password and must enter the current one.
 */
export function ChangePasswordModal({ user, self, direct, onClose }: { user: AppUser | null; self: boolean; direct: boolean; onClose: () => void }) {
  const open = !!user;
  const form = useForm<Values>({ resolver: zodResolver(direct ? setPasswordSchema : passwordSchema), defaultValues: { current: '', next: '', confirm: '' } });
  const { errors } = form.formState;
  useEffect(() => {
    if (open) form.reset({ current: '', next: '', confirm: '' });
  }, [open, form]);
  const change = useAppMutation((v: Values) => (direct ? usersService.setPassword(user!.id, v.next) : authService.changePassword(v.current ?? '', v.next)), {
    invalidate: [['auth', 'sessions']],
    success: self ? 'Password changed. Other devices were signed out.' : `New password set for ${user?.name}. Share it with them.`,
    onSuccess: onClose,
  });
  const submit = form.handleSubmit((v) => change.mutate(v));

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={self ? 'Change your password' : `Set a new password for ${user?.name ?? ''}`}
      description={self ? 'You stay signed in here; every other device is signed out.' : `${user?.email ?? ''} will be signed out and must use the new password.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={change.isPending}><KeyRound /> {self ? 'Update password' : 'Set password'}</Button></>}
    >
      <form className="space-y-4" onSubmit={submit} noValidate>
        {!direct && <FormField label="Current password" error={errors.current?.message} required><Input {...form.register('current')} type="password" autoComplete="current-password" autoFocus /></FormField>}
        <FormField label="New password" hint="At least 8 characters, with letters and numbers." error={errors.next?.message} required><Input {...form.register('next')} type="password" autoComplete="new-password" autoFocus={direct} /></FormField>
        <FormField label="Confirm new password" error={errors.confirm?.message} required><Input {...form.register('confirm')} type="password" autoComplete="new-password" /></FormField>
      </form>
    </Modal>
  );
}
