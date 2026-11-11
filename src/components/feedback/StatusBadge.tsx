import { Badge } from '@/components/ui/badge';
import type { Tone } from '@/types';

/** Central mapping of every status string used in Sahaasra to a semantic tone. */
const STATUS_TONES: Record<string, Tone> = {
  // money
  paid: 'success', partial: 'warning', unpaid: 'danger', overdue: 'danger', refunded: 'neutral', returned: 'neutral', draft: 'neutral',
  pending: 'warning', processing: 'info', approved: 'success', rejected: 'danger',
  // stock
  'in stock': 'success', 'low stock': 'warning', 'out of stock': 'danger', expiring: 'warning', expired: 'danger',
  active: 'success', inactive: 'neutral', archived: 'neutral', 'on-leave': 'warning', invited: 'info', suspended: 'danger',
  // purchases
  received: 'success', ordered: 'info',
  // attendance
  present: 'success', absent: 'danger', 'half-day': 'warning', late: 'info', leave: 'primary', holiday: 'neutral',
  // restaurant / hotel / salon
  available: 'success', occupied: 'primary', reserved: 'warning', cleaning: 'info', maintenance: 'danger',
  new: 'info', preparing: 'warning', ready: 'success', served: 'neutral', open: 'primary', billed: 'info', closed: 'neutral',
  confirmed: 'primary', 'checked-in': 'success', 'checked-out': 'neutral', cancelled: 'danger',
  booked: 'primary', 'in-progress': 'warning', completed: 'success', 'no-show': 'danger',
  'in-progress-repair': 'warning', delivered: 'neutral', sold: 'neutral', 'on-approval': 'info',
  // gst
  reconciled: 'success', 'not-started': 'neutral', filed: 'success',
  // platform
  trial: 'info', churned: 'danger', resolved: 'success',
};

const LABELS: Record<string, string> = {
  'half-day': 'Half Day', 'on-leave': 'On Leave', 'checked-in': 'Checked In', 'checked-out': 'Checked Out',
  'in-progress': 'In Progress', 'no-show': 'No Show', 'on-approval': 'On Approval', 'not-started': 'Not Started',
};

function titleCase(value: string) {
  return value.replace(/(^|[\s-])\w/g, (c) => c.toUpperCase()).replace(/-/g, ' ');
}

export function StatusBadge({ status, tone, className }: { status: string; tone?: Tone; className?: string }) {
  const key = status.toLowerCase();
  return (
    <Badge tone={tone ?? STATUS_TONES[key] ?? 'neutral'} dot className={className}>
      {LABELS[key] ?? titleCase(status)}
    </Badge>
  );
}
