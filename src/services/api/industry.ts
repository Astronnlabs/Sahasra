import type { Appointment, JewelleryItem, Kot, KotStatus, Medicine, MenuItem, MetalRate, OrderType, RepairJob, Reservation, RestaurantOrder, RestaurantTable, Room, Sale, TableStatus } from '@/types';
import { api, resource } from './client';

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
  settle: (orderId: string, method: 'cash' | 'upi' | 'card' = 'cash') => api.post<Sale>(`/restaurant/orders/${orderId}/settle`, { method }),
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

export const salonService = {
  appointments: resource<Appointment>('/appointments'),
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
