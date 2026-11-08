import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/forms/FormField';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Modal } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { qk, useAppMutation } from '@/hooks/queries';
import { formatINR } from '@/lib/format';
import { customersService, vendorsService, type PaymentInput } from '@/services';
import { PAYMENT_OPTIONS } from '@/features/sales/salesMeta';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  party: string;
  outstanding: number;
  customerId?: string;
  vendorId?: string;
}

/** Record a receipt from a customer or a payment to a vendor. */
export function RecordPaymentModal({ open, onOpenChange, party, outstanding, customerId, vendorId }: Props) {
  const schema = z.object({
    amount: z.coerce.number().positive('Enter an amount').max(outstanding, `Cannot exceed ${formatINR(outstanding)}`),
    method: z.string(),
    date: z.string().min(1),
    reference: z.string().max(40).optional(),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = form;

  useEffect(() => {
    if (open) reset({ amount: outstanding, method: vendorId ? 'bank' : 'upi', date: new Date().toISOString().slice(0, 10), reference: '' });
  }, [open, outstanding, reset, vendorId]);

  const save = useAppMutation(
    async (v: Values) => {
      const input = { amount: v.amount, method: v.method as PaymentInput['method'], date: new Date(v.date).toISOString(), reference: v.reference ?? '' };
      // The server applies the payment to the oldest unpaid invoices/bills first.
      if (customerId) return customersService.recordPayment(customerId, input);
      return vendorsService.recordPayment(vendorId!, input);
    },
    {
      invalidate: [qk.customers, qk.vendors, qk.sales, qk.purchases, ['dashboard']],
      success: () => `${vendorId ? 'Payment to' : 'Receipt from'} ${party} recorded`,
      onSuccess: () => onOpenChange(false),
    },
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={vendorId ? 'Record vendor payment' : 'Record payment received'}
      description={`${party} · ${formatINR(outstanding)} outstanding`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>Save payment</Button>
        </>
      }
    >
      <form className="grid gap-4 pb-2 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label="Amount (₹)" error={errors.amount?.message} required>
          <Input {...register('amount')} inputMode="decimal" autoFocus />
        </FormField>
        <FormField label="Method">
          <NativeSelect {...register('method')}>
            {PAYMENT_OPTIONS.filter((o) => !['credit', 'split'].includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label="Date">
          <DatePicker value={watch('date')} onChange={(d) => setValue('date', d)} />
        </FormField>
        <FormField label="Reference">
          <Input {...register('reference')} placeholder="UTR / cheque no." />
        </FormField>
      </form>
    </Modal>
  );
}
