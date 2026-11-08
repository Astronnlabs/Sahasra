import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/forms/FormField';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CITIES } from '@/app/config/constants';
import { qk, useAppMutation } from '@/hooks/queries';
import { sanitizeText } from '@/lib/sanitize';
import { customersService, vendorsService } from '@/services';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  contact: z.string().trim().max(60).optional(),
  phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{4}\s?\d{5}$/, 'Enter a valid 10-digit mobile number'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  city: z.string().trim().max(60),
  gstin: z.string().trim().toUpperCase().refine((v) => v === '' || GSTIN_RE.test(v), 'GSTIN should look like 27ABCDE1234F1Z5'),
  category: z.string().trim().max(40).optional(),
});
type Values = z.infer<typeof schema>;

/** Shared create form for customers and vendors. */
export function PartyFormDrawer({ kind, open, onOpenChange, onCreated }: { kind: 'customer' | 'vendor'; open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (id: string) => void }) {
  const isVendor = kind === 'vendor';
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', contact: '', phone: '', email: '', city: '', gstin: '', category: '' } });
  const { register, handleSubmit, reset, formState: { errors } } = form;

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const save = useAppMutation(
    async (v: Values): Promise<{ id: string; name: string }> => {
      const name = sanitizeText(v.name, 80);
      const city = sanitizeText(v.city, 60);
      if (isVendor) {
        return vendorsService.create({ name, contact: sanitizeText(v.contact ?? '', 60), phone: v.phone, email: v.email, city, gstin: v.gstin, category: v.category || 'General' });
      }
      return customersService.create({ name, phone: v.phone, email: v.email, city, gstin: v.gstin || undefined, tags: [] });
    },
    {
      invalidate: [isVendor ? qk.vendors : qk.customers],
      success: (p) => `${p.name} added`,
      onSuccess: (p) => {
        onOpenChange(false);
        onCreated?.(p.id);
      },
    },
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={isVendor ? 'Add vendor' : 'Add customer'}
      description={isVendor ? 'Suppliers you purchase stock or services from.' : 'Save customer details for faster billing and credit tracking.'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>{isVendor ? 'Add vendor' : 'Add customer'}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <FormField label={isVendor ? 'Business name' : 'Full name'} error={errors.name?.message} required>
          <Input {...register('name')} placeholder={isVendor ? 'Shree Ganesh Traders' : 'Rahul Sharma'} autoFocus />
        </FormField>
        {isVendor && (
          <FormField label="Contact person">
            <Input {...register('contact')} placeholder="Mahesh Jain" />
          </FormField>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mobile number" error={errors.phone?.message} required>
            <Input {...register('phone')} placeholder="+91 98200 11223" inputMode="tel" />
          </FormField>
          <FormField label="Email" error={errors.email?.message}>
            <Input {...register('email')} type="email" placeholder="name@example.in" />
          </FormField>
          <FormField label="City">
            <Input {...register('city')} list="party-cities" placeholder="Pune" />
          </FormField>
          <datalist id="party-cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
          <FormField label="GSTIN" error={errors.gstin?.message} hint={isVendor ? 'Needed to claim input tax credit.' : 'For B2B invoices.'}>
            <Input {...register('gstin')} className="uppercase" maxLength={15} placeholder="27ABCDE1234F1Z5" />
          </FormField>
          {isVendor && (
            <FormField label="Supply category" className="sm:col-span-2">
              <Input {...register('category')} placeholder="Groceries, Electronics…" />
            </FormField>
          )}
        </div>
      </form>
    </Drawer>
  );
}
