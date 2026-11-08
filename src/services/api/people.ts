import { format } from 'date-fns';
import type { AttendanceStatus, Employee, EmployeeAdvance, PayrollEntry } from '@/types';
import { api, resource } from './client';

/** Employee with today's attendance (null = not marked yet). */
export type EmployeeWithToday = Employee & { todayStatus: AttendanceStatus | null };

export interface AttendanceRow {
  employee: Employee;
  days: { date: string; status: AttendanceStatus | null }[];
  summary: Record<AttendanceStatus, number>;
}

type OptionalProfile = 'dob' | 'address' | 'bloodGroup' | 'pan' | 'bank';
type EmployeeInput = Omit<Employee, 'id' | 'code' | OptionalProfile> & Partial<Pick<Employee, OptionalProfile>>;

const employees = resource<Employee, EmployeeInput>('/employees');

export const employeesService = {
  ...employees,
  list: () => api.get<EmployeeWithToday[]>('/employees'),
  attendance: (month: Date) => api.get<AttendanceRow[]>('/attendance', { month: format(month, 'yyyy-MM') }),
  /** Marks one or more employees for a day. `onlyUnmarked` keeps existing marks (except absences). */
  setAttendance: (employeeIds: string | string[], date: Date, status: AttendanceStatus, onlyUnmarked = false) =>
    api.put<{ updated: number }>('/attendance', { employeeIds: Array.isArray(employeeIds) ? employeeIds : [employeeIds], date: format(date, 'yyyy-MM-dd'), status, onlyUnmarked }),
  payroll: () => api.get<PayrollEntry[]>('/payroll'),
  runPayroll: () => api.post<{ month: string; total: number; employees: number }>('/payroll/run'),
  advances: resource<EmployeeAdvance, Pick<EmployeeAdvance, 'employeeId' | 'amount' | 'monthlyRecovery' | 'reason'>>('/advances'),
};
