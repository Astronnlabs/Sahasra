import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { WIDGETS, type WidgetId } from './useDashboardLayout';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: WidgetId[];
  hidden: WidgetId[];
  toggle: (id: WidgetId) => void;
  move: (from: number, to: number) => void;
  reset: () => void;
}

const META = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));

export function DashboardCustomizer({ open, onOpenChange, order, hidden, toggle, move, reset }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Customize Dashboard"
      description="Show, hide and reorder widgets. Changes save automatically on this device."
      footer={
        <>
          <Button variant="ghost" onClick={reset}>
            <RotateCcw /> Reset to default
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        {order.length - hidden.length} of {order.length} widgets visible · drag the handle or use the arrows to reorder
      </p>
      <ul className="space-y-1.5" aria-label="Dashboard widgets">
        {order.map((id, index) => {
          const w = META[id];
          const isHidden = hidden.includes(id);
          return (
            <li
              key={id}
              draggable
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(index);
              }}
              onDragLeave={() => setOverIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                'flex items-center gap-2 rounded-xl border bg-card p-2.5 transition-all',
                overIndex === index && dragIndex !== index ? 'border-primary bg-primary-soft' : 'border-border',
                dragIndex === index && 'opacity-50',
                isHidden && 'bg-surface/50',
              )}
            >
              <span className="cursor-grab text-subtle active:cursor-grabbing" aria-hidden>
                <GripVertical className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-[13px] font-medium', isHidden && 'text-muted-foreground')}>{w.label}</p>
                <p className="truncate text-2xs text-subtle">{w.description}</p>
              </div>
              <div className="flex items-center">
                <Button variant="ghost" size="icon-sm" onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move ${w.label} up`}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => move(index, index + 1)} disabled={index === order.length - 1} aria-label={`Move ${w.label} down`}>
                  <ArrowDown />
                </Button>
              </div>
              <Switch checked={!isHidden} onCheckedChange={() => toggle(id)} aria-label={`Show ${w.label}`} />
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
}
