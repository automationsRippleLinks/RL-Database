import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ManIcon,
  WomanIcon,
  NonBinaryIcon,
  UserGroup02Icon,
  SmartPhone01Icon,
  Mail02Icon,
  CheckIcon,
} from "@hugeicons/core-free-icons";
import { PlatformMark } from "@/components/PlatformMark";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/UI/skeleton";
import { compact, formatNumber, initials, profileUrlFor } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CreatorRow } from "@/types/api";

const TH =
  "sticky top-0 z-[3] bg-rp-head px-[13px] py-2.5 text-[10.5px] font-bold tracking-[0.05em] whitespace-nowrap text-rp-muted uppercase shadow-[inset_0_-1px_0_var(--rp-border)]";
const TD = "px-[13px] py-2.5 align-middle";

interface CreatorTableProps {
  rows: CreatorRow[];
  /** Which creator the drawer is showing, so its row can carry the marker. */
  activeId: string | null;
  picked: Record<string, boolean>;
  onTogglePick: (id: string) => void;
  onTogglePage: () => void;
  onOpen: (row: CreatorRow) => void;
  isLoading: boolean;
  /** A fetch is in flight but the previous page is still on screen. */
  isFetching: boolean;
}

/**
 * The results table.
 *
 * Only the rows scroll: the header is `sticky top-0` inside the scroll box, with
 * its bottom rule drawn as an inset shadow rather than a border because a
 * border on a sticky <th> detaches and scrolls away in every browser. At 250
 * rows per page, losing the column names is losing the table.
 *
 * Every truncating cell (Languages, Categories) shows one value plus a "+N"
 * badge, never a wrapped list — a row that changes height when a creator speaks
 * four languages makes the whole table jump as you page through it.
 */
export function CreatorTable({
  rows,
  activeId,
  picked,
  onTogglePick,
  onTogglePage,
  onOpen,
  isLoading,
  isFetching,
}: CreatorTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 10 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const allPicked = rows.length > 0 && rows.every((row) => picked[row.id]);

  return (
    <table className="w-full table-fixed border-collapse text-[11px]">
      <thead>
        <tr>
          <th className={cn(TH, "text-left w-10")}>
            <TickBox
              checked={allPicked}
              onClick={onTogglePage}
              label="Select everyone on this page"
            />
          </th>
          <th className={cn(TH, "text-left w-46 text-[12px]")}>Creator</th>
          <th className={cn(TH, "text-center w-20 text-[12px] ")}>Platform</th>
          <th className={cn(TH, "text-center w-20 text-[12px]")}>Followers</th>
          <th className={cn(TH, "text-center w-23 text-[12px]")}>Avg views</th>
          <th className={cn(TH, "text-left w-20 text-[12px]")}>Location</th>
          <th className={cn(TH, "text-center w-30 text-[12px]")}>Gender</th>
          <th className={cn(TH, "text-left w-25 text-[12px]")}>Languages</th>
          <th className={cn(TH, "text-left w-38 text-[12px]")}>Categories</th>
          <th className={cn(TH, "text-center w-25 text-[12px]")}>Contact</th>
        </tr>
      </thead>

      <tbody className={cn("transition-opacity", isFetching && "opacity-50")}>
        {rows.map((row) => {
          const isActive = row.id === activeId;
          const isPicked = Boolean(picked[row.id]);
          // const state = stateOf(row.city);
          const city = row.city?.trim() || "—";
          const state = row.state?.trim() || "—";
          const region = row.region?.trim() || "—";

          const profileUrl = profileUrlFor(row);

          return (
            <tr
              key={row.id}
              onClick={() => onOpen(row)}
              className={cn(
                "cursor-pointer border-t border-rp-border transition-colors",
                isActive
                  ? "bg-rp-primary-soft shadow-[inset_3px_0_0_var(--rp-primary)]"
                  : isPicked
                    ? "bg-rp-surface2"
                    : "hover:bg-rp-surface2",
              )}
            >
              <td className={cn(TD, "text-left")}>
                <TickBox
                  checked={isPicked}
                  label={`Select ${row.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePick(row.id);
                  }}
                />
              </td>

              {/* <td className={TD}> */}
              <td className={cn(TD, "w-180")}>
                <span className="flex items-center gap-2.25">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-rp-border bg-rp-surface2 text-[10.5px] font-bold">
                    {initials(row.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold whitespace-nowrap">
                      {row.name}
                    </span>
                    {profileUrl ? (
                      <a
                        href={profileUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={(event) => event.stopPropagation()}
                        className="block text-[11.5px] whitespace-nowrap text-rp-muted hover:underline"
                      >
                        @{row.username}
                      </a>
                    ) : (
                      <span className="block text-[11.5px] whitespace-nowrap text-rp-muted">
                        @{row.username}
                      </span>
                    )}
                  </span>
                </span>
              </td>

              {/* <td className={cn(TD, 'text-center')}> */}
              <td className={cn(TD, "w-20 text-center")}>
                <span className="inline-flex">
                  <PlatformMark platform={row.platform} />
                </span>
              </td>

              <td
                className={cn(TD, "text-center tabular-nums")}
                title={
                  row.followers !== null
                    ? `${formatNumber(row.followers)} followers`
                    : undefined
                }
              >
                {compact(row.followers)}
              </td>
              <td
                className={cn(TD, "text-center tabular-nums")}
                title={
                  row.avg_views !== null
                    ? `${formatNumber(row.avg_views)} views per post`
                    : undefined
                }
              >
                {compact(row.avg_views)}
              </td>

              <td className={TD}>
                {city !== "—" ? (
                  <>
                    <span className="block text-[12px] font-medium leading-5 whitespace-nowrap">
                      {city}
                    </span>
                    <span className="block text-[10px] leading-4 text-rp-muted whitespace-nowrap">
                      {state}
                    </span>
                  </>
                ) : state !== "—" ? (
                  <>
                    <span className="block text-[12px] font-medium leading-5 whitespace-nowrap">
                      {state}
                    </span>
                    <span className="block text-[10px] leading-4 text-rp-muted whitespace-nowrap">
                      {region}
                    </span>
                  </>
                ) : (
                  <span className="block text-[12px] font-medium leading-5 whitespace-nowrap">
                    {region}
                  </span>
                )}
              </td>

              <td className={cn(TD, "text-center")}>
                <GenderGlyph gender={row.gender} />
              </td>

              <td className={TD}>
                <TruncatedList
                  items={row.languages}
                  overflowTitle="Also speaks"
                  chipFirst
                />
              </td>

              <td className={TD}>
                <TruncatedList
                  items={row.categories}
                  overflowTitle="Also"
                  chipFirst
                />
              </td>

              <td className={cn(TD, "text-center w-50")}>
                <span className="inline-flex items-center justify-center gap-2">
                  <ContactGlyph
                    value={row.emails.length ? row.emails[0] : null}
                    title={
                      row.emails.length ? "Copy Email" : "No email on file"
                    }
                    icon={Mail02Icon}
                  />

                  <ContactGlyph
                    value={row.phones.length ? row.phones[0] : null}
                    title={
                      row.phones.length ? "Copy number" : "No phone on file"
                    }
                    // icon={<Smartphone className="size-4.25" />}
                    icon={SmartPhone01Icon}
                  />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TickBox({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-3.75 cursor-pointer items-center justify-center rounded border-[1.5px] align-middle transition-colors",
        checked
          ? "border-rp-primary bg-rp-primary text-rp-primary-fg"
          : "border-rp-box",
      )}
    >
      <HugeiconsIcon
        icon={CheckIcon}
        className={cn("size-2.75", !checked && "opacity-0")}
        strokeWidth={3.4}
      />
    </button>
  );
}

/**
 * Gender is a free-text column in the database (`Creator.gender` is a plain
 * str), so this matches the spellings that actually occur and shows a neutral
 * glyph for anything else rather than guessing. The raw value is always the
 * accessible name and the tooltip — the glyph is the shorthand, not the claim.
 */
const GENDER_GLYPH: { test: RegExp; icon: IconSvgElement }[] = [
  { test: /^\s*(f|female|woman|women)\s*$/i, icon: WomanIcon },
  { test: /^\s*(m|male|man|men)\s*$/i, icon: ManIcon },
  {
    test: /^\s*(nb|non[-\s]?binary|other|transgender|trans)\s*$/i,
    icon: NonBinaryIcon,
  },
];

function GenderGlyph({ gender }: { gender: string | null }) {
  if (!gender?.trim()) return <span className="text-rp-muted">—</span>;
  const icon =
    GENDER_GLYPH.find(({ test }) => test.test(gender))?.icon ?? UserGroup02Icon;
  return (
    <span
      title={gender}
      aria-label={gender}
      className="inline-flex text-rp-muted"
    >
      <HugeiconsIcon icon={icon} className="size-4.25" />
    </span>
  );
}

/** First value as a chip, the rest behind a dashed "+N" that names them on hover. */
function TruncatedList({
  items,
  overflowTitle,
  chipFirst,
}: {
  items: string[];
  overflowTitle: string;
  chipFirst?: boolean;
}) {
  if (!items.length) return <span className="text-rp-muted">—</span>;
  const rest = items.length - 1;

  return (
    <span className="flex items-center gap-1.25 whitespace-nowrap">
      <span
        className={cn(
          "rounded-md bg-rp-surface2 px-1.75 py-0.5 text-[11px]",
          chipFirst && "border border-rp-border",
        )}
      >
        {items[0]}
      </span>
      {rest > 0 && (
        <span
          title={`${overflowTitle}: ${items.slice(1).join(", ")}`}
          className="cursor-help rounded-md border border-dashed border-rp-box px-1.25   py-0.5 text-[10.5px] text-rp-muted"
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

// function WorkedWithUs({ count }: { count: number | null | undefined }) {
//   // Absent is not zero. The backend does not send this yet (see CreatorRow),
//   // and "Not yet" would be an assertion we cannot make.
//   if (count === null || count === undefined) {
//     return (
//       <span title="Not available from the API yet" className="text-rp-muted">
//         —
//       </span>
//     );
//   }
//   if (count === 0) {
//     return (
//       <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-rp-muted">
//         <CircleDashed className="size-4" />
//         Not yet
//       </span>
//     );
//   }
//   return (
//     <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-rp-success">
//       <Check className="size-4" strokeWidth={3} />
//       {count} {count === 1 ? "campaign" : "campaigns"}
//     </span>
//   );
// }

/**
 * mailto / tel / profile. Faint and inert when there is nothing on file, rather
 * than hidden — an empty cell reads as a rendering bug, a greyed glyph reads as
 * "we don't have this".
 */
function ContactGlyph({
  value,
  title,
  icon,
}: {
  value: string | null;
  title: string;
  icon: IconSvgElement;
}) {
  const { copy } = useToast();

  if (!value) {
    return (
      <span
        title={title}
        aria-label={title}
        className="inline-flex text-rp-faint"
      >
        <HugeiconsIcon icon={icon} className="size-4.25" />
      </span>
    );
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        copy(value, "Copied!");
      }}
      className="inline-flex text-rp-primary cursor-pointer hover:text-rp-text"
    >
      <HugeiconsIcon icon={icon} className="size-4.25" />
    </button>
  );
}
