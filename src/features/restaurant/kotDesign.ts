import { useQuery } from '@tanstack/react-query';
import { kotDesignService, type KotDesign } from '@/services';
import type { Kot } from '@/types';

export const KOT_DESIGN_KEY = ['kot-design'];

export const DEFAULT_KOT_DESIGN: KotDesign = {
  paper: 'thermal80',
  font: 'mono',
  title: 'KOT',
  itemSize: 'large',
  showBusiness: true,
  showOrderType: true,
  showTime: true,
  showNotes: true,
  showItemCount: true,
  showKotNumber: true,
  header: '',
  footer: '',
};

/** Pages that print KOTs: the KOT designer is shown only to people who can open one of them. */
export const KOT_PAGES = ['restaurant-orders', 'restaurant-kitchen'];

/** The business's saved KOT design (Bill Studio → KOT ticket), or the Sahaasra default. */
export function useKotDesign(enabled = true) {
  const { data, isLoading } = useQuery({ queryKey: KOT_DESIGN_KEY, queryFn: kotDesignService.get, enabled, staleTime: 60_000 });
  return { design: { ...DEFAULT_KOT_DESIGN, ...(data?.design ?? {}) }, saved: data?.design ?? null, isLoading };
}

/** Placeholder ticket for previews and test prints. */
export const sampleKot = (): Kot => ({
  id: 'test',
  number: 'KOT-0001',
  orderId: 'test',
  table: 'Table 4',
  type: 'dine-in',
  status: 'new',
  createdAt: new Date().toISOString(),
  items: [
    { name: 'Chicken Biryani', qty: 2 },
    { name: 'Paneer Butter Masala', qty: 1, note: 'Less spicy' },
    { name: 'Butter Naan', qty: 4 },
  ],
});
