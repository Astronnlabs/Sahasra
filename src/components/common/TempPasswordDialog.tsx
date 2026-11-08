import { Check, Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';

export interface TempLogin {
  name: string;
  login: string;
  password: string;
}

/**
 * Shows a one-time temporary password. It is not stored anywhere readable, so the
 * admin must share it now; the person should change it after signing in.
 */
export function TempPasswordDialog({ value, onClose }: { value: TempLogin | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard?.writeText(`Sign-in: ${value.login}\nTemporary password: ${value.password}`).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Modal
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title="Share these sign-in details"
      description={value ? `Temporary password for ${value.name}. It is shown only once.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={copy}>{copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}</Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {value && (
        <div className="space-y-3 pb-2">
          <div className="rounded-xl border border-border bg-surface p-4 text-[13px]">
            <p className="text-xs text-muted-foreground">Sign in with</p>
            <p className="mt-0.5 font-medium">{value.login}</p>
            <p className="mt-3 text-xs text-muted-foreground">Temporary password</p>
            <p className="mt-0.5 select-all font-mono text-[17px] font-semibold tracking-wider text-primary">{value.password}</p>
          </div>
          <p className="flex gap-2 text-xs text-muted-foreground">
            <KeyRound className="h-4 w-4 shrink-0 text-primary" /> Ask them to change it from Settings → Security after their first sign-in.
          </p>
        </div>
      )}
    </Modal>
  );
}
