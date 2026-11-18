import type { Appointment, JewelleryItem, Kot, KotStatus, Medicine, MenuItem, MetalRate, OrderType, RepairJob, Reservation, RestaurantOrder, RestaurantTable, Room, Sale, TableStatus } from '@/types';
import { api, resource } from './client';
import { announceSale } from './saleEvents';

export const restaurantService = {
  menu: () => api.get<MenuItem[]>('/restaurant/menu'),
  addMenuItem: (input: Omit<MenuItem, 'id'>) => api.post<MenuItem>('/restaurant/menu', input),
  tables: () => api.get<RestaurantTable[]>('/restaurant/tables'),
  addTable: (input: Pick<RestaurantTable, 'label' | 'seats' | 'area'>) => api.post<RestaurantTable>('/restaurant/tables', input),
  removeTable: (id: string) => api.del<{ id: string }>(`/restaurant/tables/${id}`),
  setTableStatus: (id: string, status: TableStatus) => api.patch<RestaurantTable>(`/restaurant/tables/${id}/status`, { status }),
  orders: () => api.get<RestaurantOrder[]>('/restaurant/orders'),
  kots: () => api.get<Kot[]>('/restaurant/kots'),
  openOrder: (tableId: string | undefined, type: OrderType, customer?: string) => api.post<RestaurantOrder>('/restaurant/orders/open', { tableId, type, customer }),
  /** Prices are re-read from the menu on the server. */
  saveLines: (orderId: string, lines: RestaurantOrder['lines']) => api.put<RestaurantOrder>(`/restaurant/orders/${orderId}/lines`, { lines }),
  sendKot: (orderId: string) => api.post<Kot | null>(`/restaurant/orders/${orderId}/kot`),
  setKotStatus: (id: string, status: KotStatus) => api.patch<Kot>(`/restaurant/kots/${id}`, { status }),
  transfer: (fromId: string, toId: string) => api.post<{ ok: true }>('/restaurant/tables/transfer', { fromId, toId }),
  merge: (targetId: string, otherIds: string[]) => api.post<{ ok: true }>('/restaurant/tables/merge', { targetId, otherIds }),
  /** Creates a paid invoice for the order and frees its table(s). */
  settle: (orderId: string, method: 'cash' | 'upi' | 'card' = 'cash') => api.post<Sale>(`/restaurant/orders/${orderId}/settle`, { method }).then(announceSale),
};

type ReservationInput = Pick<Reservation, 'guest' | 'phone' | 'roomNumber' | 'checkIn' | 'checkOut' | 'guests' | 'advance' | 'source'>;

export const hotelService = {
  rooms: resource<Room>('/hotel/rooms'),
  reservations: {
    list: () => api.get<Reservation[]>('/hotel/reservations'),
    create: (input: ReservationInput) => api.post<Reservation>('/hotel/reservations', input),
    /** Only the status changes after booking; the room board is kept in sync on the server. */
    update: (id: string, patch: Pick<Reservation, 'status'>) => api.patch<Reservation>(`/hotel/reservations/${id}`, patch),
    remove: (id: string) => api.del<{ id: string }>(`/hotel/reservations/${id}`),
  },
};

/** Online booking link settings (opening hours) and VAAHAK forwarding status. */
export interface BookingSettings {
  enabled: boolean;
  open: string;
  close: string;
  days: number[];
  step: 15 | 30 | 60;
  daysAhead: number;
}
export interface BookingState {
  slug: string | null;
  url: string | null;
  settings: BookingSettings;
  vaahak: { linked: boolean; syncedAt: string | null; error: string | null };
}

export const salonService = {
  appointments: resource<Appointment>('/appointments'),
  booking: () => api.get<BookingState>('/appointments/booking'),
  saveBooking: (s: BookingSettings) => api.put<BookingState>('/appointments/booking', s),
  newBookingLink: () => api.post<BookingState>('/appointments/booking/new-link'),
  syncVaahak: () => api.post<BookingState & { imported: number; updated: number }>('/appointments/vaahak-sync'),
};

/** The public booking page (customers, no login). */
export interface PublicBooking {
  business: { name: string; address: string; phone: string; logo: string | null };
  services: { id: string; name: string; durationMins: number; price: number; category: string; staff: string[] }[];
  staff: string[];
  hours: { open: string; close: string; days: number[]; daysAhead: number };
}
export const publicBookingService = {
  get: (slug: string) => api.get<PublicBooking>(`/public/booking/${encodeURIComponent(slug)}`),
  slots: (slug: string, q: { date: string; serviceId: string; staff?: string }) =>
    api.get<string[]>(`/public/booking/${encodeURIComponent(slug)}/slots`, { date: q.date, serviceId: q.serviceId, ...(q.staff ? { staff: q.staff } : {}) }),
  book: (slug: string, b: { serviceId: string; staff?: string; date: string; time: string; name: string; phone: string; notes?: string }) =>
    api.post<{ id: string; business: string; service: string; staff: string; start: string; durationMins: number; price: number }>(`/public/booking/${encodeURIComponent(slug)}`, b),
};

export const jewelleryService = {
  rates: {
    list: () => api.get<MetalRate[]>('/jewellery/rates'),
    update: (id: string, patch: Pick<MetalRate, 'ratePerGram'>) => api.patch<MetalRate>(`/jewellery/rates/${id}`, patch),
  },
  items: resource<JewelleryItem, Omit<JewelleryItem, 'id' | 'sku'>>('/jewellery/items'),
  repairs: resource<RepairJob, Omit<RepairJob, 'id' | 'ticket' | 'received'>>('/jewellery/repairs'),
};

export const pharmacyService = {
  medicines: resource<Medicine>('/pharmacy/medicines'),
};
