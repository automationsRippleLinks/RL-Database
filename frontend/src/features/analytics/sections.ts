import { Building2, Megaphone, Send, Users, type LucideIcon } from 'lucide-react';

/**
 * The four Analytics sections. To add the next one (say Brands): build its page, give it a route in
 * router.tsx, and set `ready: true` here. Nothing else in Creators changes.
 */
export type SectionId = 'creators' | 'brands' | 'campaigns' | 'pitches';

export const SECTIONS: { id: SectionId; title: string; icon: LucideIcon; ready: boolean }[] = [
  { id: 'creators', title: 'Creators', icon: Users, ready: true },
  { id: 'brands', title: 'Brands', icon: Building2, ready: false },
  { id: 'campaigns', title: 'Campaigns', icon: Megaphone, ready: false },
  { id: 'pitches', title: 'Pitches', icon: Send, ready: false },
];
