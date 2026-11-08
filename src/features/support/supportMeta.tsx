import { Badge } from '@/components/ui/badge';
import type { Tone, TicketCategory, TicketPriority } from '@/types';

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  billing: 'Billing & plan',
  technical: 'Technical issue',
  gst: 'GST & tax',
  account: 'Account & access',
  feature: 'Feature request',
};

const PRIORITY_TONE: Record<TicketPriority, Tone> = { low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger' };

export const PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as TicketCategory[];

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{priority[0].toUpperCase() + priority.slice(1)}</Badge>;
}
