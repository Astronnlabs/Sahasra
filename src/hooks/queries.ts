import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';
import {
  customersService,
  employeesService,
  notificationsService,
  productsService,
  purchasesService,
  salesService,
  vendorsService,
} from '@/services';

/** Centralised query keys so invalidation stays consistent across modules. */
export const qk = {
  products: ['products'] as const,
  services: ['services'] as const,
  packages: ['packages'] as const,
  jobCards: ['job-cards'] as const,
  serials: (productId: string) => ['products', productId, 'serials'] as const,
  customers: ['customers'] as const,
  customer: (id: string) => ['customers', id] as const,
  vendors: ['vendors'] as const,
  vendor: (id: string) => ['vendors', id] as const,
  sales: ['sales'] as const,
  salesReturns: ['sales', 'returns'] as const,
  purchases: ['purchases'] as const,
  purchaseReturns: ['purchases', 'returns'] as const,
  expenses: ['expenses'] as const,
  employees: ['employees'] as const,
  employee: (id: string) => ['employees', id] as const,
  attendance: (month: string) => ['attendance', month] as const,
  payroll: ['payroll'] as const,
  advances: ['advances'] as const,
  inventory: ['inventory'] as const,
  movements: ['inventory', 'movements'] as const,
  warehouses: ['inventory', 'warehouses'] as const,
  notifications: ['notifications'] as const,
  audit: ['audit'] as const,
  users: ['users'] as const,
  roles: ['roles'] as const,
  dashboard: (part: string, ...args: string[]) => ['dashboard', part, ...args] as const,
  restaurant: (part: string) => ['restaurant', part] as const,
};

export const useProducts = () => useQuery({ queryKey: qk.products, queryFn: productsService.list });
export const useCustomers = () => useQuery({ queryKey: qk.customers, queryFn: customersService.list });
export const useVendors = () => useQuery({ queryKey: qk.vendors, queryFn: vendorsService.list });
export const useSales = () => useQuery({ queryKey: qk.sales, queryFn: salesService.list });
export const usePurchases = () => useQuery({ queryKey: qk.purchases, queryFn: purchasesService.list });
export const useEmployees = () => useQuery({ queryKey: qk.employees, queryFn: employeesService.list });
/** Polled so stock and payment alerts show up without a reload. */
export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: notificationsService.list, staleTime: 15_000, refetchInterval: 30_000 });

interface MutationOptions<TData> {
  invalidate: QueryKey[];
  success?: string | ((data: TData) => string);
  onSuccess?: (data: TData) => void;
}

/** Mutation with cache invalidation and toast feedback built in. */
export function useAppMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>, opts: MutationOptions<TData>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      opts.invalidate.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(data) : opts.success);
      opts.onSuccess?.(data);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    },
  });
}
