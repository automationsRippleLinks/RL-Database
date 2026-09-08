import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, FileText, Megaphone, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { readRecents } from '@/lib/recents';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import type { SearchScope } from '@/types/api';
import {
  detailPath,
  useBrandFacets,
  useCampaignFacets,
  useCreatorFacets,
  usePitchFacets,
} from '@/features/search/queries';

const SCOPE_ICON: Record<SearchScope, LucideIcon> = {
  creators: Users,
  brands: Building2,
  campaigns: Megaphone,
  pitches: FileText,
};

/**
 * The landing screen: four doors, in plain language, with how much is behind
 * each. Written for someone opening this tool for the first time — the section
 * names alone don't tell a salesperson what a "pitch" record actually is.
 */
export function HomeScreen() {
  useDocumentTitle('Search');
  const navigate = useNavigate();

  // All four are the same hard-cached facet queries the sections themselves use,
  // so opening a section afterwards is a cache hit rather than a second request.
  const creators = useCreatorFacets();
  const brands = useBrandFacets();
  const campaigns = useCampaignFacets();
  const pitches = usePitchFacets();

  const sections: {
    scope: SearchScope;
    title: string;
    oneLiner: string;
    count: number | undefined;
    /** Already plural: every one of these counts is "N <things> on file". */
    noun: string;
  }[] = [
    {
      scope: 'creators',
      title: 'Creators',
      oneLiner: 'People who post — reach, topics and contacts.',
      count: creators.data?.total_creators,
      noun: 'creators',
    },
    {
      scope: 'brands',
      title: 'Brands',
      oneLiner: 'Companies we sell to, and our history with them.',
      count: brands.data?.total_brands,
      noun: 'brands',
    },
    {
      scope: 'campaigns',
      title: 'Campaigns',
      oneLiner: 'Work we are delivering, and how it is going.',
      count: campaigns.data?.total_campaigns,
      noun: 'campaigns',
    },
    {
      scope: 'pitches',
      title: 'Pitches',
      oneLiner: 'Proposals we sent, and which ones we won.',
      count: pitches.data?.total_pitches,
      noun: 'pitches',
    },
  ];

  // Read once per mount: localStorage doesn't notify, and the list only changes
  // as a result of navigating away from this screen anyway.
  const recents = useMemo(() => readRecents(), []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-11 pb-10">
      <div className="mx-auto max-w-[940px]">
        <h1 className="mb-[18px] text-center text-xl font-bold tracking-[-0.01em]">
          Search everything at once, or pick a section
        </h1>

        <div className="grid grid-cols-1 gap-[11px] sm:grid-cols-2 lg:grid-cols-4">
          {sections.map(({ scope, title, oneLiner, count, noun }) => {
            const Icon = SCOPE_ICON[scope];
            return (
              <button
                key={scope}
                type="button"
                onClick={() => navigate(`/search/${scope}`)}
                className="flex cursor-pointer flex-col items-start gap-2.5 rounded-[14px] border border-rp-border bg-rp-surface p-4 text-left transition-colors hover:border-rp-primary hover:bg-rp-surface2"
              >
                <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-rp-primary-soft text-rp-primary">
                  <Icon className="size-[19px]" />
                </span>
                <span className="block">
                  <span className="block text-[14.5px] font-bold">{title}</span>
                  <span className="mt-0.5 block text-[11.5px] tabular-nums text-rp-muted">
                    {count === undefined ? 'Counting…' : `${formatNumber(count)} ${noun} on file`}
                  </span>
                </span>
                <span className="block text-xs leading-[1.45] text-rp-muted text-pretty">
                  {oneLiner}
                </span>
              </button>
            );
          })}
        </div>

        {recents.length > 0 && (
          <div className="mt-[22px]">
            <span className="mb-2 block text-[10.5px] font-bold tracking-[0.06em] text-rp-muted uppercase">
              Recently opened
            </span>
            <div className="flex flex-wrap gap-[7px]">
              {recents.map((entry) => {
                const Icon = SCOPE_ICON[entry.scope];
                return (
                  <Link
                    key={`${entry.scope}-${entry.id}`}
                    // Creators have no page of their own any more — they open
                    // as a drawer over the results, addressed by ?creator=.
                    to={
                      entry.scope === 'creators'
                        ? `/search/creators?creator=${encodeURIComponent(entry.id)}`
                        : detailPath(entry.scope, entry.id)
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-rp-border px-3 py-[7px] text-[12.5px] font-medium text-rp-text no-underline hover:bg-rp-surface2"
                  >
                    <Icon className="size-[15px] text-rp-muted" />
                    {entry.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
