import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleDashed,
  ClipboardList,
  Clock,
  Copy,
  Mail,
  Maximize2,
  Minimize2,
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
import { MONTH_LABELS, PLATFORM_LABELS } from '@/lib/enums';
import { compact, formatNumber, initials, profileUrlFor } from '@/lib/format';
import { describePlace } from '@/lib/geo';
import { cn } from '@/lib/utils';
import type { CampaignStatus, CreatorCampaignSummary, CreatorDetail } from '@/types/api';
import { useCreatorDetail } from '../queries';
import { commercialPackageFor } from './deliverables';

/**
 * Must match the `rpDrawerOut` duration in index.css. The panel is unmounted
 * when the exit animation ends, and a shorter value here cuts it off mid-slide.
 */
const EXIT_MS = 185;

/**
 * The creator record, as a panel over the results rather than a page.
 *
 * This replaces the old full profile page. Keeping the list visible behind it is
 * the point: choosing between creators means comparing them, and a navigation
 * that throws away the list you were comparing makes you rebuild it every time.
 */
export function CreatorDrawer({
  creatorId,
  onClose,
}: {
  creatorId: string;
  onClose: () => void;
}) {
  const { copy, flash } = useToast();
  const [closing, setClosing] = useState(false);
  const [dealsOpen, setDealsOpen] = useState(false);
  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const [contactIndex, setContactIndex] = useState({ email: 0, phone: 0 });
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [displayedId, setDisplayedId] = useState(creatorId);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data, isPending, isError, error, refetch } = useCreatorDetail(displayedId);
  useCreatorDetail(creatorId);

  // Clicking another row swaps the contents in place. Everything that was
  // "opened" belongs to the creator who was showing, not to the panel — and a
  // close that was already in flight is abandoned, so a click that both
  // dismisses and re-opens lands on the new record instead of unmounting.
  useEffect(() => {
    if (creatorId === displayedId) return;

    clearTimeout(exitTimer.current);   // a row click overrides a pending close
    exitTimer.current = undefined;
    clearTimeout(swapTimer.current);
    swapTimer.current = undefined;

    setClosing(true); // trigger closing animation
    swapTimer.current = setTimeout(() => {
      setDisplayedId(creatorId);
      setClosing(false);
      setDealsOpen(false);
      setCampaignsOpen(false);
      setContactIndex({ email: 0, phone: 0 });
    }, EXIT_MS);
  }, [creatorId, displayedId]);

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

  // ×, Escape and a click anywhere outside all close it, through the same
  // capture-phase listener every other transient surface uses — except the
  // results themselves, where a click means "show me this one instead".
  useDismissable(['drawer', 'results'], !closing, requestClose);

  return (
    // The overlay itself is inert: the results stay clickable to the drawer's
    // left, so a click on another row swaps the panel rather than being eaten.
    <div className="pointer-events-none fixed inset-0 z-60">
      <div
        data-rp-pop="drawer"
        role="dialog"
        aria-modal="false"
        aria-label={data ? `${data.name} — creator record` : 'Creator record'}
        className={cn(
          'pointer-events-auto absolute top-0 right-0 flex h-full max-w-[96vw] flex-col border-l border-rp-border bg-rp-surface shadow-rp',
          'transition-[width] duration-200 ease-out',
          campaignsOpen ? 'w-181' : 'w-106',
          closing ? 'animate-rp-drawer-out' : 'animate-rp-drawer',
        )}
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
            dealsOpen={dealsOpen}
            onToggleDeals={() => setDealsOpen((open) => !open)}
            campaignsOpen={campaignsOpen}
            onToggleCampaigns={() => setCampaignsOpen((open) => !open)}
            contactIndex={contactIndex}
            onCycleContact={(kind, length) =>
              setContactIndex((current) => ({
                ...current,
                [kind]: (current[kind] + 1) % length,
              }))
            }
            onCopy={copy}
            onFlash={flash}
          />
        )}
      </div>
    </div>
  );
}

/** The close button alone, for the loading and error states. */
function DrawerBar({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex shrink-0 justify-end border-b border-rp-border px-4.5 py-4.5 ">
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

interface DrawerBodyProps {
  detail: CreatorDetail;
  onClose: () => void;
  dealsOpen: boolean;
  onToggleDeals: () => void;
  campaignsOpen: boolean;
  onToggleCampaigns: () => void;
  contactIndex: { email: number; phone: number };
  onCycleContact: (kind: 'email' | 'phone', length: number) => void;
  onCopy: (text: string, message: string) => void;
  onFlash: (message: string) => void;
}

function DrawerBody({
  detail,
  onClose,
  dealsOpen,
  onToggleDeals,
  campaignsOpen,
  onToggleCampaigns,
  contactIndex,
  onCycleContact,
  onCopy,
  onFlash,
}: DrawerBodyProps) {
  const profileUrl = profileUrlFor(detail);
  const packageQuote = commercialPackageFor(detail);

  const emails = [detail.email, ...(detail.additional_emails ?? [])].filter(Boolean) as string[];
  const phones = [detail.phone, ...(detail.additional_phones ?? [])].filter(Boolean) as string[];

  // "Worked with us" counts campaigns that ran. A dropped link means they were
  // proposed and cut, which is a different fact and is worth saying separately.
  const ran = detail.campaigns.filter((campaign) => !campaign.is_dropped);
  const dropped = detail.campaigns.filter((campaign) => campaign.is_dropped);

  return (
    <>
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-start gap-3 border-b border-rp-border px-4.5 pt-4.5 pb-3.75">
        <span className="flex size-10.25 shrink-0 items-center justify-center rounded-xl bg-rp-primary-soft text-[13px] font-bold text-rp-primary">
          {initials(detail.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold tracking-[-0.01em]">{detail.name}</span>
          <span className="mt-0.75   flex items-center gap-1.5">
            <PlatformMark platform={detail.platform} size={14} />
            {profileUrl ? (
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                title={`Open profile on ${PLATFORM_LABELS[detail.platform]}`}
                className="truncate text-xs text-rp-primary hover:underline"
              >
                @{detail.username}
              </a>
            ) : (
              <span className="truncate text-xs text-rp-muted">@{detail.username}</span>
            )}
            {profileUrl && (
              <IconButton
                title="Copy profile link"
                onClick={() => onCopy(profileUrl, 'Profile link copied')}
                icon={Copy}
              />
            )}
          </span>
        </span>
        <CloseButton onClose={onClose} />
      </div>

      <div className={cn('flex min-h-0 flex-1', campaignsOpen ? 'flex-row' : 'flex-col')}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {/* ── stats ────────────────────────────────────────────────────── */}
          <div className="grid shrink-0 grid-cols-2 gap-px bg-rp-border">
            <Stat label="Followers" value={compact(detail.followers)} full={detail.followers} />
            <Stat label="Avg views" value={compact(detail.avg_views)} full={detail.avg_views} />
            <Stat label="Campaigns with us" value={String(ran.length)} />
            <Stat label="Times pitched" value={String(detail.pitches.length)} />
          </div>

          {/* ── commercial package ───────────────────────────────────────── */}
          {packageQuote && (
            <section className="shrink-0 border-t border-rp-border px-[18px] py-[15px]">
              <Eyebrow>Commercial package</Eyebrow>
              <div className="mb-[11px] flex items-baseline gap-2.5">
                <span className="shrink-0 text-2xl font-bold tracking-[-0.01em] whitespace-nowrap tabular-nums">
                  ₹{packageQuote.total.toLocaleString('en-IN')}
                </span>
                <span
                  title={packageQuote.items.map((item) => item.label).join(' + ')}
                  className="min-w-0 truncate text-[11.5px] text-rp-muted"
                >
                  package of {packageQuote.items.length}{' '}
                  {packageQuote.items.length === 1 ? 'deliverable' : 'deliverables'}
                </span>
              </div>

              <button
                type="button"
                onClick={onToggleDeals}
                aria-expanded={dealsOpen}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-[10px] border border-rp-border px-[11px] py-[9px] text-xs font-semibold',
                  dealsOpen ? 'text-rp-primary' : 'text-rp-text',
                )}
              >
                <ClipboardList className="size-[15px] shrink-0" />
                <span className="flex-1 text-left">Deliverables</span>
                <ChevronDown
                  className={cn('size-3.5 shrink-0 transition-transform', dealsOpen && 'rotate-180')}
                  strokeWidth={2.2}
                />
              </button>

              {dealsOpen && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {packageQuote.items.map(({ key, label, icon: Icon, cost }) => (
                    <div
                      key={key}
                      className="flex min-w-0 flex-[0_1_calc(50%-4px)] items-center gap-2.5 rounded-[11px] border border-rp-border bg-rp-surface2 px-3 py-[11px]"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-rp-primary-soft text-rp-primary">
                        <Icon className="size-[15px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] whitespace-nowrap text-rp-muted">
                          {label}
                        </span>
                        <span className="mt-px block text-sm font-bold tabular-nums">
                          ₹{cost.toLocaleString('en-IN')}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <span className="mt-2.5 block text-[11px] text-rp-muted">
                Indicative, from the last quote we have on file. Confirm before pitching.
              </span>
            </section>
          )}

          {/* ── profile ──────────────────────────────────────────────────── */}
          <section className="shrink-0 border-t border-rp-border px-[18px] py-[15px]">
            <Eyebrow>Profile</Eyebrow>
            <div className="flex flex-col gap-[9px]">
              <Fact label="Location" value={describePlace(detail.city)} />
              <Fact
                label="Categories"
                value={detail.categories[0] ?? '—'}
                extra={detail.categories.length > 1 ? `+${detail.categories.length - 1}` : ''}
                extraTitle={`Also: ${detail.categories.slice(1).join(', ')}`}
              />
              <Fact
                label="Languages"
                value={detail.languages.slice(0, 2).join(', ') || '—'}
                extra={detail.languages.length > 2 ? `+${detail.languages.length - 2}` : ''}
                extraTitle={`Also: ${detail.languages.slice(2).join(', ')}`}
              />
              <Fact label="Gender" value={detail.gender ?? '—'} />
              <Fact
                label="Worked with us"
                value={
                  ran.length
                    ? `Yes — ${ran.length} ${ran.length === 1 ? 'campaign' : 'campaigns'}`
                    : dropped.length
                      ? 'Proposed but dropped'
                      : 'Not yet'
                }
              />
            </div>
          </section>

          {/* ── contact ──────────────────────────────────────────────────── */}
          {(emails.length > 0 || phones.length > 0) && (
            <section className="shrink-0 border-t border-rp-border px-[18px] py-[15px]">
              <Eyebrow>Contact</Eyebrow>
              <div className="flex flex-col gap-[9px]">
                {emails.length > 0 && (
                  <ContactRow
                    label="Email"
                    values={emails}
                    index={contactIndex.email}
                    href={(value) => `mailto:${value}`}
                    actionTitle="Send an email"
                    onCopy={(value) => onCopy(value, 'Email copied')}
                    onNext={() => onCycleContact('email', emails.length)}
                  />
                )}
                {phones.length > 0 && (
                  <ContactRow
                    label="Phone"
                    values={phones}
                    index={contactIndex.phone}
                    href={(value) => `tel:${value.replace(/\s/g, '')}`}
                    actionTitle="Call this number"
                    onCopy={(value) => onCopy(value, 'Phone number copied')}
                    onNext={() => onCycleContact('phone', phones.length)}
                  />
                )}
              </div>
            </section>
          )}
        </div>

        {/* ── campaigns ──────────────────────────────────────────────────── */}
        <div
          className={cn(
            'flex flex-col',
            campaignsOpen
              ? 'min-h-0 flex-[0_0_300px] overflow-hidden border-l border-rp-border bg-rp-surface'
              : 'flex-[0_0_auto] border-t border-rp-border',
          )}
        >
          <button
            type="button"
            onClick={onToggleCampaigns}
            aria-expanded={campaignsOpen}
            className="flex w-full shrink-0 cursor-pointer items-center gap-[9px] px-[18px] pt-[15px] pb-[11px] text-left"
          >
            <span className="flex-1 text-[10.5px] font-bold tracking-[0.06em] text-rp-muted uppercase">
              Campaigns
            </span>
            <span className="rounded-full bg-rp-surface2 px-[7px] py-px text-[10.5px] font-bold tabular-nums text-rp-muted">
              {detail.campaigns.length}
            </span>
            {campaignsOpen ? (
              <Minimize2 className="size-[15px] shrink-0 text-rp-primary" />
            ) : (
              <Maximize2 className="size-[15px] shrink-0 text-rp-muted" />
            )}
          </button>

          {campaignsOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-[15px]">
              {detail.campaigns.map((campaign) => (
                <CampaignRow key={campaign.campaign_id} campaign={campaign} />
              ))}
              {detail.campaigns.length === 0 && (
                <p className="pt-1.5 pb-0.5 text-xs text-rp-muted">
                  We have not hired this creator yet.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── footer ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 gap-2 border-t border-rp-border px-[18px] py-3.5">
        {emails.length > 0 && (
          <a
            href={`mailto:${emails[0]}`}
            title="Email this creator"
            aria-label="Email this creator"
            className="inline-flex items-center justify-center rounded-[10px] border border-rp-border px-3 py-2.5 text-rp-text hover:bg-rp-surface2"
          >
            <Mail className="size-4" />
          </a>
        )}
        <button
          type="button"
          // Pitch lists are the next thing to build, not something this screen
          // can fake. Saying so is better than a button that appears to work.
          onClick={() => onFlash("Pitch lists aren't built yet — this is where they'll start")}
          className="flex-1 cursor-pointer rounded-[10px] bg-rp-primary px-3.5 py-2.5 text-[12.5px] font-bold text-rp-primary-fg"
        >
          Add to a pitch list
        </button>
      </div>
    </>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-[11px] block text-[10.5px] font-bold tracking-[0.06em] text-rp-muted uppercase">
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  /** The exact number, as a tooltip — the tile shows the compact form. */
  full?: number | null;
}) {
  return (
    <div className="bg-rp-surface px-4 py-[13px]">
      <span className="block text-[10.5px] font-semibold tracking-[0.04em] text-rp-muted uppercase">
        {label}
      </span>
      <span
        className="mt-[3px] block text-[15px] font-bold tabular-nums"
        title={full !== null && full !== undefined ? formatNumber(full) : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function Fact({
  label,
  value,
  extra,
  extraTitle,
}: {
  label: string;
  value: string;
  extra?: string;
  extraTitle?: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[98px] shrink-0 text-xs text-rp-muted">{label}</span>
      <span className="min-w-0 flex-1 text-[12.5px] font-medium text-pretty">{value}</span>
      {extra && (
        <span
          title={extraTitle}
          className="shrink-0 cursor-help rounded-md border border-dashed border-rp-box px-1.5 py-px text-[10.5px] text-rp-muted"
        >
          {extra}
        </span>
      )}
    </div>
  );
}

/**
 * One contact line, at a fixed 22px.
 *
 * A creator can have three emails and two numbers. Listing them all makes the
 * panel's height depend on how messy one record is; cycling through them in
 * place keeps every creator's drawer the same shape, and the "1/3" says there is
 * more without needing the room to show it.
 */
function ContactRow({
  label,
  values,
  index,
  href,
  actionTitle,
  onCopy,
  onNext,
}: {
  label: string;
  values: string[];
  index: number;
  href: (value: string) => string;
  actionTitle: string;
  onCopy: (value: string) => void;
  onNext: () => void;
}) {
  const position = index % values.length;
  const value = values[position];

  return (
    <div className="flex h-[22px] items-center gap-2.5">
      <span className="w-[82px] shrink-0 text-xs text-rp-muted">{label}</span>
      <a
        href={href(value)}
        title={actionTitle}
        className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-rp-primary hover:underline"
      >
        {value}
      </a>
      <IconButton title={`Copy ${label.toLowerCase()}`} onClick={() => onCopy(value)} icon={Copy} />
      {values.length > 1 && (
        <span className="inline-flex shrink-0 items-center gap-[3px]">
          <span className="text-[10px] tabular-nums text-rp-muted">
            {position + 1}/{values.length}
          </span>
          <IconButton
            title={`Next ${label.toLowerCase()} (${position + 1} of ${values.length})`}
            onClick={onNext}
            icon={ArrowRight}
          />
        </span>
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

function CampaignRow({ campaign }: { campaign: CreatorCampaignSummary }) {
  // A creator dropped from a campaign is not the campaign's own status: the
  // campaign may well have run without them, and saying "Done" would imply they
  // were part of it.
  const status = campaign.is_dropped
    ? { label: 'Dropped from this', icon: CircleDashed, className: 'text-rp-warn' }
    : (STATUS_STYLE[campaign.status] ?? {
      label: campaign.status,
      icon: CircleDashed,
      className: 'text-rp-muted',
    });
  const StatusIcon = status.icon;

  const period = `${MONTH_LABELS[campaign.month_name] ?? campaign.month_name} ${campaign.year}`;
  const brand = campaign.brand?.name ?? 'no brand linked';

  return (
    <div className="flex items-center gap-[11px] border-t border-rp-border py-[9px]">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold">{campaign.campaign_name}</span>
        <span className="block truncate text-[11.5px] text-rp-muted">
          {brand} · {period}
        </span>
      </span>
      <span title={status.label} aria-label={status.label} className={cn('inline-flex', status.className)}>
        <StatusIcon className="size-4" />
      </span>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  icon: Icon,
}: {
  title: string;
  onClick: () => void;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={title}
      className="flex shrink-0 cursor-pointer rounded-md p-[3px] text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
    >
      <Icon className="size-[13px]" />
    </button>
  );
}
