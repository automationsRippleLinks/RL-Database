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
import type { CreatorDetail } from '@/types/api';


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

export interface CommercialPackage {
  /** Headline figure, in rupees. */
  total: number;
  items: Deliverable[];
  name: string;
  validFrom: string;
}

export function commercialPackageFor(detail: CreatorDetail): CommercialPackage | null {
  const pkg = detail.package;
  if (!pkg) return null;

  const items: Deliverable[] = pkg.items
    .filter((item) => item.quantity > 0)
    .map((item) => ({
      key: item.deliverable_type,
      ...present(item.deliverable_type),
      quantity: item.quantity,
      cost: item.price * item.quantity,
    }));

  const summed = items.reduce((total, item) => total + item.cost, 0);
  const total = pkg.cost > 0 ? pkg.cost : summed;
  if (total <= 0 && items.length === 0) return null;

  return { total, items, name: pkg.name, validFrom: pkg.valid_from};
}
