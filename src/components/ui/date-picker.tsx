import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface CalendarProps {
  value?: Date;
  onChange: (date: Date) => void;
}

export function Calendar({ value, onChange }: CalendarProps) {
  const [month, setMonth] = useState(() => value ?? new Date());
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }),
    [month],
  );
  return (
    <div className="w-[264px] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-semibold" aria-live="polite">{format(month, 'MMMM yyyy')}</span>
        <button type="button" className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center" role="grid">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <span key={d} className="py-1 text-2xs font-medium text-subtle">{d}</span>
        ))}
        {days.map((day) => {
          const selected = value && isSameDay(day, value);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onChange(day)}
              aria-pressed={selected}
              aria-label={format(day, 'd MMMM yyyy')}
              className={cn(
                'h-8 rounded-lg text-xs tabular transition-colors hover:bg-primary-light',
                !isSameMonth(day, month) && 'text-subtle/60',
                isToday(day) && !selected && 'font-semibold text-primary',
                selected && 'bg-primary text-white hover:bg-primary-hover',
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface DatePickerProps {
  value?: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

/** Value is a `yyyy-MM-dd` string so it plugs directly into forms. */
export function DatePicker({ value, onChange, placeholder = 'Select date', className, ...rest }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const date = value ? parseISO(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...rest}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-[13px] transition-colors hover:border-primary/30 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12',
            !date && 'text-subtle',
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 text-subtle" />
          {date ? format(date, 'dd MMM yyyy') : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0">
        <Calendar
          value={date}
          onChange={(d) => {
            onChange(format(d, 'yyyy-MM-dd'));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
