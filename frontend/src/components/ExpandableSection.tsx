import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Reusable section button for Creator and Brand drawers.
type ExpandableSectionProps = {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
};

export function ExpandableSection({
  label,
  count,
  open,
  onToggle,
}: ExpandableSectionProps) {
  return (
    <div className="shrink-0 border-t border-rp-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.25 px-4.5 pt-3.75 pb-2.75 text-left",
          open && "bg-rp-primary-soft/30",
        )}
      >
        {/* Section name */}
        <span className="min-w-0 flex-1 text-[10.5px] font-bold tracking-[0.06em] text-rp-muted uppercase">
          {label}
        </span>

        {/* Total number of records */}
        <span className="rounded-full bg-rp-surface2 px-1.75 py-px text-[10.5px] font-bold tabular-nums text-rp-muted">
          {count}
        </span>

        {/* Icon indicates whether the side panel is open. */}
        {open ? (
          <Minimize2 className="size-3.75 shrink-0 text-rp-primary" />
        ) : (
          <Maximize2 className="size-3.75 shrink-0 text-rp-muted" />
        )}
      </button>
    </div>
  );
}