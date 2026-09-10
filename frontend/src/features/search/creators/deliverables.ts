import {
  Clapperboard,
  Images,
  Layers,
  MonitorPlay,
  Repeat2,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { CreatorDetail, CreatorPitchSummary } from '@/types/api';

/**
 * The drawer's "Commercial package": what this creator last quoted us, per
 * deliverable.
 *
 * The numbers are real — they are the PitchCreatorLink cost columns, the price
 * agreed on an actual pitch — not a rate card and not a computed estimate. That
 * is why the disclaimer under them says "from the last quote we have on file":
 * the figure is accurate about the past and says nothing about today.
 *
 * The set of deliverables varies genuinely per creator, because a quote prices
 * what was asked for. Anything absent or zero is dropped rather than rendered as
 * ₹0, which would read as "free" instead of "not quoted".
 */
export interface Deliverable {
  key: string;
  label: string;
  icon: LucideIcon;
  cost: number;
}

const ITEMS: { key: keyof CreatorPitchSummary; label: string; icon: LucideIcon }[] = [
  { key: 'reel_cost', label: 'Reel', icon: Video },
  { key: 'reel_story_cost', label: 'Reel story', icon: Clapperboard },
  { key: 'video_story_cost', label: 'Video story', icon: Clapperboard },
  { key: 'static_carousel_cost', label: 'Static / carousel', icon: Images },
  { key: 'short_form_videos_cost', label: 'Short-form video', icon: Video },
  { key: 'reshare_short_form_videos_cost', label: 'Reshared short', icon: Repeat2 },
  { key: 'dedicated_video_cost', label: 'Dedicated video', icon: MonitorPlay },
  { key: 'integrated_video_cost', label: 'Integrated video', icon: Layers },
];

export interface CommercialPackage {
  /** Headline figure, in rupees. */
  total: number;
  items: Deliverable[];
  /** The pitch these numbers came from, for the "last quote" claim. */
  pitchCode: string;
}

/**
 * Picks the quote to show and breaks it down.
 *
 * "The last quote" is taken as the first pitch on the detail payload that
 * actually carries costs — CreatorDetail.pitches arrives newest-first from the
 * detail endpoint, and a pitch with every cost at zero is one that was never
 * priced rather than one priced at nothing.
 *
 * Returns null when nothing is priced, and the drawer then omits the whole
 * section: an empty "Commercial package" heading over a ₹0 is worse than not
 * raising the subject.
 */
export function commercialPackageFor(detail: CreatorDetail): CommercialPackage | null {
  for (const pitch of detail.pitches ?? []) {
    const items: Deliverable[] = [];
    for (const { key, label, icon } of ITEMS) {
      const cost = pitch[key];
      if (typeof cost === 'number' && cost > 0) {
        items.push({ key: String(key), label, icon, cost });
      }
    }
    if (!items.length) continue;

    // package_cost is the agreed bundle price and can be less than the sum of
    // its parts — a package discount is normal — so it wins when it is set.
    const summed = items.reduce((total, item) => total + item.cost, 0);
    const total = typeof pitch.package_cost === 'number' && pitch.package_cost > 0
      ? pitch.package_cost
      : summed;

    return { total, items, pitchCode: pitch.pitch_code };
  }
  return null;
}
