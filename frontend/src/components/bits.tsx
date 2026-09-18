import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { Badge } from './UI/badge';
import { cn } from '@/lib/utils';
import {
  CAMPAIGN_STATUS_LABELS,
  ORG_TYPE_LABELS,
  PITCH_REQUIREMENT_LABELS,
  PLATFORM_LABELS,
  TIER_LABELS,
} from '@/lib/enums';
import type {
  BrandRef,
  CampaignStatus,
  OrgType,
  PitchRequirement,
  Platform,
  Tier,
} from '@/types/api';

export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string | null | undefined;
  children?: ReactNode;
  className?: string;
}) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline',
        className,
      )}
    >
      {children ?? 'open'}
      <ExternalLinkIcon className="size-3" />
    </a>
  );
}

/**
 * A brand reference, or an explicit "not linked" when it's absent.
 *
 * `brand_id` is nullable and the ingest path doesn't populate it yet, so null is the
 * common case rather than an edge case — rendering a blank cell there would look like
 * a UI bug instead of missing data.
 */
export function BrandLink({
  brand,
  className,
  emphasis = 'normal',
}: {
  brand: BrandRef | null | undefined;
  className?: string;
  emphasis?: 'normal' | 'medium';
}) {
  if (!brand) {
    return <span className="text-muted-foreground italic">not linked</span>;
  }
  return (
    <Link
      to={`/brands/${brand.id}`}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'hover:underline',
        emphasis === 'medium' && 'font-medium',
        className,
      )}
    >
      {brand.name}
    </Link>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return <Badge variant="outline">{PLATFORM_LABELS[platform] ?? platform}</Badge>;
}

export function PlatformBadges({ platforms }: { platforms: Platform[] }) {
  if (!platforms?.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {platforms.map((platform) => (
        <PlatformBadge key={platform} platform={platform} />
      ))}
    </span>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  // TierChoices.NA is the empty string, so fall through to a readable label.
  const label = TIER_LABELS[tier] ?? tier ?? 'Unspecified';
  return <Badge variant={tier === '' ? 'outline' : 'default'}>{label}</Badge>;
}

const STATUS_VARIANT: Record<CampaignStatus, 'success' | 'primary' | 'warning' | 'destructive'> = {
  completed: 'success',
  wip: 'primary',
  'on hold': 'warning',
  scrapped: 'destructive',
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'default'}>
      {CAMPAIGN_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function OrgTypeBadge({ orgType }: { orgType: OrgType }) {
  return <Badge variant="outline">{ORG_TYPE_LABELS[orgType] ?? orgType}</Badge>;
}

export function RequirementBadge({ requirement }: { requirement: PitchRequirement }) {
  return <Badge variant="outline">{PITCH_REQUIREMENT_LABELS[requirement] ?? requirement}</Badge>;
}

/** A list of short labels as chips, overflowing into a “+N” counter. */
export function ChipList({ items, max = 3 }: { items: string[]; max?: number }) {
  if (!items.length) return <span className="text-muted-foreground">—</span>;
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((item) => (
        <Badge key={item}>{item}</Badge>
      ))}
      {rest > 0 && <span className="text-[11px] text-muted-foreground">+{rest}</span>}
    </span>
  );
}

export function DefinitionList({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">{children}</dl>;
}

export function DefinitionItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

export function SectionTitle({
  children,
  count,
  action,
}: {
  children: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {children}
        {count !== undefined && (
          <span className="text-xs font-normal text-muted-foreground tnum">({count})</span>
        )}
      </h2>
      {action}
    </div>
  );
}
