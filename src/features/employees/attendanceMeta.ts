import type { AttendanceStatus } from '@/types';

export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; short: string; cell: string; dot: string }> = {
  present: { label: 'Present', short: 'P', cell: 'bg-success-soft text-success', dot: 'bg-success' },
  absent: { label: 'Absent', short: 'A', cell: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  'half-day': { label: 'Half Day', short: 'H', cell: 'bg-warning-soft text-[#a26f08] dark:text-warning', dot: 'bg-warning' },
  late: { label: 'Late', short: 'L', cell: 'bg-info-soft text-info', dot: 'bg-info' },
  leave: { label: 'Leave', short: 'LV', cell: 'bg-primary-light text-primary', dot: 'bg-primary' },
  holiday: { label: 'Holiday', short: '—', cell: 'bg-surface text-subtle', dot: 'bg-subtle' },
};

export const ATTENDANCE_ORDER: AttendanceStatus[] = ['present', 'late', 'half-day', 'absent', 'leave', 'holiday'];
