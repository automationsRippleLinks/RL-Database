import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Check,
  CircleDashed,
  Clock,
  Copy,
  PauseCircle,
  X,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PlatformMark } from '@/components/PlatformMark';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';
import { useDismissable } from '@/hooks/useDismissable';
import { withBackState } from '@/lib/navigation';
import { MONTH_LABELS, ORG_TYPE_LABELS, PLATFORM_LABELS } from '@/lib/enums';
import { compact, formatCurrency, formatDate, formatNumber, initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BrandDetail, CampaignRow, CampaignStatus, CreatorRow, PitchRow } from '@/types/api';
import { useBrandDetail } from '../queries';
import { DetailDrawer } from "@/components/DetailDrawer";
import { ExpandableSection as SideSectionButton } from "@/components/ExpandableSection";


/** Must match the rpDrawerOut duration in index.css — see CreatorDrawer.tsx. */
const EXIT_MS = 185;

/**
 * How many rows a section shows inline before handing off to "See all". The
 * backend already caps campaigns/pitches at BRAND_DETAIL_LIMIT (100) and
 * top_creators at TOP_CREATORS_LIMIT (10) so the drawer never has to fetch
 * an unbounded list, but rendering up to 100 rows inline — even collapsed
 * behind one expand toggle — is still the wrong shape for a brand that's
 * been running a while. This is the second cap: a brand with, say, 60
 * campaigns shows its most recent 10 here and links out to the real,
 * paginated Campaigns page (pre-filtered to this brand) for the rest.
 */
const INLINE_LIMIT = 10;
// the brand drawer has three sections that can open in a side panel
type BrandSection = "campaigns" | "pitches" | "creators";


/**
 * The brand record, as a panel over the results — same shell as
 * CreatorDrawer (swap-in-place on another row click, dismiss on outside
 * click/Escape, slide animation), with brand-shaped content in place of a
 * creator's. Campaigns, pitches and creators are still their own pages, so
 * rows inside those sections navigate out to them rather than trying to
 * preview a page that isn't a drawer yet.
 */
export function BrandDrawer({
  brandId,
  onClose,
}: {
  brandId: number;
  onClose: () => void;
}) {
  const { copy } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [closing, setClosing] = useState(false);
  // tracks which section is currently open in the right side panel and null means if there is no section is implement the panel will stay with same width
  const [activeSection, setActiveSection] = useState<BrandSection | null>(null)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [displayedId, setDisplayedId] = useState(brandId);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data, isPending, isError, error, refetch } = useBrandDetail(displayedId);
  useBrandDetail(brandId);

  useEffect(() => {
    if (brandId === displayedId) return;

    clearTimeout(exitTimer.current);
    exitTimer.current = undefined;
    clearTimeout(swapTimer.current);
    swapTimer.current = undefined;

    swapTimer.current = setTimeout(() => {
      setDisplayedId(brandId);

      // A newly selected brand should start with no section open.
      setActiveSection(null);

      setClosing(false);
    }, EXIT_MS);
  }, [brandId, displayedId]);

  useEffect(() => () => {
    clearTimeout(swapTimer.current);
    clearTimeout(exitTimer.current);
    exitTimer.current = undefined;
    swapTimer.current = undefined;
  }, []);

  const requestClose = useCallback(() => {
    if (exitTimer.current) return;

    clearTimeout(swapTimer.current);
    swapTimer.current = undefined;

    setClosing(true);
    exitTimer.current = setTimeout(onClose, EXIT_MS);
  }, [onClose]);
  // Navigate when a row in the right-side panel is clicked.
  const openDetail = (path: string) => {
    requestClose();
    navigate(path, withBackState(location));
  };
  useDismissable(['drawer', 'results'], !closing, requestClose);

  return (
    <DetailDrawer
      ariaLabel={data ? `${data.name} — brand record` : "Brand record"}
      closing={closing}
      sidePanel={
        activeSection && data && !isPending && !isError
          ? {
            // The selected section determines the right panel's heading.
            title:
              activeSection === "campaigns"
                ? "Campaigns"
                : activeSection === "pitches"
                  ? "Pitches"
                  : "Most-used creators",

            count:
              activeSection === "campaigns"
                ? data.campaign_count
                : activeSection === "pitches"
                  ? data.pitch_count
                  : data.top_creators.length,

            // We'll move the existing rows here in the next step.
            content:
              activeSection === "campaigns" ? (
                <>
                  {/* Show the brand's recent campaigns in the right panel. */}
                  {data.campaigns.length === 0 ? (
                    <p className="text-xs text-rp-muted">
                      No campaigns for this brand yet.
                    </p>
                  ) : (
                    data.campaigns.map((campaign) => (<CampaignRowItem
                      key={campaign.id}
                      campaign={campaign}
                      onClick={() => openDetail(`/campaigns/${campaign.id}`)}
                    />
                    ))
                  )}


                </>
              ) : activeSection === "pitches" ? (
                <>
                  {data.pitches.length === 0 ? (
                    <p className="text-xs text-rp-muted">
                      No pitches for this brand yet.
                    </p>
                  ) : (
                    data.pitches.map((pitch) => (
                      <PitchRowItem
                        key={pitch.id}
                        pitch={pitch}
                        onClick={() => openDetail(`/pitches/${pitch.id}`)}
                      />
                    ))
                  )}


                </>
              ) : activeSection === "creators" ? (
                <>
                  {/* Show the brand's most-used creators in the right panel. */}
                  {data.top_creators.slice(0, INLINE_LIMIT).map((creator) => (
                    <CreatorRowItem
                      key={creator.id}
                      creator={creator}
                      onClick={() => openDetail(`/creators/${creator.id}`)}
                    />
                  ))}

                  {/* Open the full filtered creator list when more creators exist. */}
                  {data.top_creators.length > 10 && (

                    <button
                      type="button"
                      onClick={() =>
                        openDetail(`/search/creators?c_brand=${data.id}`)
                      }
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-rp-border py-2 text-xs font-semibold text-rp-primary hover:bg-rp-surface2"
                    >
                      See all {formatNumber(data.creator_count)}
                      <ArrowRight className="size-3.25" />
                    </button>

                  )}
                </>
              ) : null,
            // Close the side panel without closing the Brand drawer.
            onClose: () => setActiveSection(null),
          }
          : null
      }
    >
      {isError ? (
        <div className="flex h-full flex-col">
          <DrawerBar onClose={requestClose} />
          <div className="p-4">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        </div>
      ) : isPending || !data ? (
        <div className="flex h-full flex-col">
          <DrawerBar onClose={requestClose} />
          <div className="space-y-3 p-4.5">
            <Skeleton className="h-11 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : (
        <DrawerBody
          detail={data}
          onClose={requestClose}
          onCopy={copy}
          activeSection={activeSection}
          onToggleSection={(section) =>
            setActiveSection((current) =>
              current === section ? null : section
            )
          }
        />
      )}
    </DetailDrawer>
  );
}

// Shared helper used by the loading and error states.
function DrawerBar({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex shrink-0 justify-end border-b border-rp-border px-4.5 py-4.5">
      <CloseButton onClose={onClose} />
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      title="Close"
      aria-label="Close"
      className="flex shrink-0 cursor-pointer rounded-lg p-1 text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
    >
      <X className="size-4" />
    </button>
  );
}

function DrawerBody({
  detail,
  onClose,
  onCopy,
  activeSection,
  onToggleSection,
}: {
  detail: BrandDetail;
  onClose: () => void;
  onCopy: (text: string, message: string) => void;

  // The section currently selected in the Brand drawer.
  // null means no side panel is open.
  activeSection: BrandSection | null;

  // Lets DrawerBody ask BrandDrawer to open or close a section.
  onToggleSection: (section: BrandSection) => void;

}) {




  return (
    <>

      {/* ── header ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-start gap-3 border-b border-rp-border px-4.5 pt-4.5 pb-3.75">
        <span className="flex size-10.25 shrink-0 items-center justify-center rounded-xl bg-rp-primary-soft text-[13px] font-bold text-rp-primary">
          {initials(detail.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-bold tracking-[-0.01em]">
            {detail.name}
          </span>
          <span className="mt-0.75 flex flex-wrap items-center gap-1.5 text-xs text-rp-muted">
            <Building2 className="size-3.25 shrink-0" />
            {detail.company?.name ?? 'No billing company linked'}
          </span>
        </span>
        <CloseButton onClose={onClose} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
        {/* ── stats ────────────────────────────────────────────────────── */}
        <div className="grid shrink-0 grid-cols-2 gap-px bg-rp-border">
          <Stat label="Campaigns" value={formatNumber(detail.campaign_count)} />
          <Stat label="Pitches" value={formatNumber(detail.pitch_count)} />
          <Stat label="Creators engaged" value={formatNumber(detail.creator_count)} />
          <Stat
            label="Total brand cost"
            value={formatCurrency(detail.total_brand_cost)}
            hint="Across all campaigns"
          />
        </div>

        {/* ── profile ──────────────────────────────────────────────────── */}
        <section className="shrink-0 border-t border-rp-border px-4.5 py-3.75">
          <Eyebrow>Profile</Eyebrow>
          <div className="flex flex-col gap-2.25">
            <Fact label="Billing company" value={detail.company?.name ?? 'Not linked'} />
            <Fact
              label="Brand GSTIN"
              value={detail.gstin || 'Not on file'}
              mono={Boolean(detail.gstin)}
              onCopy={detail.gstin ? () => onCopy(detail.gstin!, 'GSTIN copied') : undefined}
            />
            <Fact
              label="Company GSTIN"
              value={detail.company?.gstin || 'Not on file'}
              mono={Boolean(detail.company?.gstin)}
              onCopy={
                detail.company?.gstin
                  ? () => onCopy(detail.company!.gstin!, 'GSTIN copied')
                  : undefined
              }
            />
            <Fact
              label="Org types"
              value={
                detail.org_types.length
                  ? detail.org_types.map((type) => ORG_TYPE_LABELS[type] ?? type).join(', ')
                  : '—'
              }
            />
            <div className="flex items-baseline gap-3">
              <span className="w-24.5 shrink-0 text-xs text-rp-muted">Platforms</span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {detail.platforms.length ? (
                  detail.platforms.map((platform) => (
                    <span
                      key={platform}
                      title={PLATFORM_LABELS[platform] ?? platform}
                      className="inline-flex"
                    >
                      <PlatformMark platform={platform} size={15} />
                    </span>
                  ))
                ) : (
                  <span className="text-[12.5px] font-medium text-rp-text">—</span>
                )}
              </span>
            </div>
            <Fact label="Last activity" value={formatDate(detail.latest_activity)} />
          </div>
        </section>

        {/* ── campaigns ────────────────────────────────────────────────── */}
        {/* The button stays on the left; its rows now appear on the right. */}
        <SideSectionButton
          label="Campaigns"
          count={detail.campaign_count}
          open={activeSection === "campaigns"}
          onToggle={() => onToggleSection("campaigns")}
        />

        {/* ── pitches ──────────────────────────────────────────────────── */}
        {/* Pitches button stays on the left; rows appear on the right. */}
        <SideSectionButton
          label="Pitches"
          count={detail.pitch_count}
          open={activeSection === "pitches"}
          onToggle={() => onToggleSection("pitches")}
        />

        {/* ── top creators ─────────────────────────────────────────────── */}
        {detail.top_creators.length > 0 && (
          <SideSectionButton
            label="Most-used creators"
            count={detail.top_creators.length}
            open={activeSection === "creators"}
            onToggle={() => onToggleSection("creators")}
          />
        )}
      </div>
    </>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2.75 block text-[10.5px] font-bold tracking-[0.06em] text-rp-muted uppercase">
      {children}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-rp-surface px-4 py-3.25">
      <span className="block text-[10.5px] font-semibold tracking-[0.04em] text-rp-muted uppercase">
        {label}
      </span>
      <span className="mt-0.75 block text-3.75 font-bold tabular-nums" title={hint}>
        {value}
      </span>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-24.5 shrink-0 text-xs text-rp-muted">{label}</span>
      <span
        className={cn(
          'min-w-0 flex-1 text-[12.5px] font-medium text-pretty',
          mono && 'font-mono text-[11.5px]',
        )}
      >
        {value}
      </span>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          title={`Copy ${label.toLowerCase()}`}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="flex shrink-0 cursor-pointer rounded-md p-0.75 text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
        >
          <Copy className="size-3.25" />
        </button>
      )}
    </div>
  );
}



const STATUS_STYLE: Record<CampaignStatus, { label: string; icon: LucideIcon; className: string }> = {
  wip: { label: 'Running', icon: Clock, className: 'text-rp-primary' },
  completed: { label: 'Done', icon: Check, className: 'text-rp-success' },
  'on hold': { label: 'On hold', icon: PauseCircle, className: 'text-rp-warn' },
  scrapped: { label: 'Dropped', icon: XCircle, className: 'text-rp-danger' },
};

function RowShell({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.75 border-t border-rp-border py-2.25 text-left first:border-t-0 hover:bg-rp-surface2"
    >
      {children}
    </button>
  );
}

function CampaignRowItem({ campaign, onClick }: { campaign: CampaignRow; onClick: () => void }) {
  const status = STATUS_STYLE[campaign.status] ?? {
    label: campaign.status,
    icon: CircleDashed,
    className: 'text-rp-muted',
  };
  const StatusIcon = status.icon;
  const period = `${MONTH_LABELS[campaign.month_name] ?? campaign.month_name} ${campaign.year}`;

  return (
    <RowShell onClick={onClick}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold">{campaign.campaign_name}</span>
        <span className="block truncate text-[11.5px] text-rp-muted">
          {campaign.campaign_code} · {period}
        </span>
      </span>
      <span title={status.label} aria-label={status.label} className={cn('inline-flex', status.className)}>
        <StatusIcon className="size-4" />
      </span>
    </RowShell>
  );
}

function PitchRowItem({ pitch, onClick }: { pitch: PitchRow; onClick: () => void }) {
  return (
    <RowShell onClick={onClick}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold">{pitch.campaign_name}</span>
        <span className="block truncate text-[11.5px] text-rp-muted">
          {pitch.pitch_code} · {pitch.sales_lead}
        </span>
      </span>
      {pitch.converted ? (
        <span title="Converted" className="inline-flex text-rp-success">
          <Check className="size-4" strokeWidth={3} />
        </span>
      ) : (
        <span title="Not converted" className="inline-flex text-rp-muted">
          <CircleDashed className="size-4" />
        </span>
      )}
    </RowShell>
  );
}

function CreatorRowItem({ creator, onClick }: { creator: CreatorRow; onClick: () => void }) {
  return (
    <RowShell onClick={onClick}>
      <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full border border-rp-border bg-rp-surface2 text-[9.5px] font-bold">
        {initials(creator.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold">{creator.name}</span>
        <span className="block truncate text-[11.5px] text-rp-muted">@{creator.username}</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-rp-muted">
        <PlatformMark platform={creator.platform} size={13} />
        {compact(creator.followers)}
      </span>
    </RowShell>
  );
}