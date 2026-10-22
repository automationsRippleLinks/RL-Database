import { Globe } from 'lucide-react';
import { PLATFORM_LABELS } from '@/lib/enums';
import { cn } from '@/lib/utils';
import type { Platform } from '@/types/api';
import { profileUrlFor } from '@/lib/format';

/**
 * The platform column and drawer header render a brand mark rather than a text
 * badge — the four marks are recognisable at 18px in a way "Instagram" set in
 * 11px is not, and it buys back a column's width in a 13-column table.
 *
 * The files in /public/icons are simple-icons marks with the brand colour baked
 * in, so they are drawn as <img> rather than inlined: nothing here wants to tint
 * them, and keeping them as assets means a mark can be corrected without a
 * rebuild. `others` and `NA` have no mark and fall back to a muted globe.
 */
const MARK_FILES: Partial<Record<Platform, string>> = {
  instagram: '/icons/instagram.svg',
  youtube: '/icons/youtube.svg',
  linkedin: '/icons/linkedin.svg',
  facebook: '/icons/facebook.svg',
};

export function PlatformMark({
  platform,
  size = 18,
  className,
}: {
  platform: Platform;
  size?: number;
  className?: string;
}) {
  const label = PLATFORM_LABELS[platform] ?? platform;
  const file = MARK_FILES[platform];

  if (!file) {
    return (
      <Globe
        aria-label={label}
        className={cn('text-rp-muted', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={file}
      alt={label}
      title={label}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      style={{ width: size, height: size }}
    />
  );
}

/** True when this platform has a brand mark to show in the filter list. */
export function hasMark(platform: Platform): boolean {
  return platform in MARK_FILES;
}

/**
 * The platform mark as a link to the creator's profile on that platform.
 * Falls back to the plain mark when no profile link can be worked out.
 * stopPropagation keeps a click here from also opening the row's drawer.
 */
export function PlatformLink({
  row,
  size,
}: {
  row: { platform: Platform; username: string; profile_url?: string | null };
  size?: number;
}) {
  const url = profileUrlFor(row);
  const mark = <PlatformMark platform={row.platform} size={size} />;
  if (!url) return mark;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(event) => event.stopPropagation()}
      title={`Open profile on ${PLATFORM_LABELS[row.platform] ?? row.platform}`}
      className="inline-flex"
    >
      {mark}
    </a>
  );
}