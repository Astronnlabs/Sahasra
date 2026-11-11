import { api } from './client';

/** One print in the business's print history (no customer details are stored). */
export interface PrintJobRecord {
  id: string;
  kind: 'bill' | 'kot';
  reference: string;
  printer: string;
  connection: 'bluetooth-classic' | 'bluetooth-le' | 'windows';
  device: string;
  copies: number;
  status: 'printed' | 'failed' | 'cancelled' | 'interrupted';
  error: string | null;
  reprint: boolean;
  createdAt: string;
  finishedAt: string | null;
  /** Who printed it (filled in by the server). */
  user?: string | null;
}

export const printJobsService = {
  list: () => api.get<PrintJobRecord[]>('/print-jobs'),
  sync: (jobs: PrintJobRecord[]) => api.post<{ saved: number }>('/print-jobs/sync', { jobs }),
};
