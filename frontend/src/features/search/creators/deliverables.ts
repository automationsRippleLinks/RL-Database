import {
  Clapperboard,
  Images,
  Layers,
  MonitorPlay,
  Package,
  Repeat2,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { LatestCostDeliverable } from '@/types/api';

export interface Deliverable {
  key: string;
  label: string;
  icon: LucideIcon;
  quantity: number;
  cost: number;
}

const PRESENTATION: Record<string, {label: string, icon: LucideIcon}> = {
  reel: {label: 'Reel', icon: Video},
  reel_story: {label: 'Reel story', icon: Clapperboard},
  video_story: {label: 'Video story', icon: Clapperboard},
  static_carousel: {label: 'Static / carousel', icon: Images},
  short_form_video: {label: 'Short-form video', icon: Video},
  reshare_short_form_video: {label: 'Reshared short', icon: Repeat2},
  dedicated_video: {label: 'Dedicated video', icon: MonitorPlay},
  integrated_video: {label: 'Integrated video', icon: Layers},
};

function present(type: string): { label: string, icon: LucideIcon } {
  const key = type.trim().toLocaleLowerCase().replace(/[\s-]+/g, '_');
  const known = PRESENTATION[key];
  if (known) return known;
  const label = key.replace(/_/g, ' ');
  return {
    label: label.charAt(0).toUpperCase() + label.slice(1),
    icon: Package,
  };
}

/** The items behind the latest cost, ready to draw. Empty when there are none. */
export function deliverablesFor(
  items: LatestCostDeliverable[] | string | null | undefined,
): Deliverable[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item.quantity > 0)
    .map((item) => ({
      key: item.deliverable_type,
      ...present(item.deliverable_type),
      quantity: item.quantity,
      cost: Number(item.price ?? 0) * item.quantity,
    }));
}

/** "Reel ×1 + Story ×3", for tooltips. */
export function deliverablesLabel(
  items: LatestCostDeliverable[] | string | null | undefined,
): string {
  if (typeof items === 'string') return items;
  return deliverablesFor(items)
    .map((d) => (d.quantity > 1 ? `${d.label} ×${d.quantity}` : d.label))
    .join(' + ');
}