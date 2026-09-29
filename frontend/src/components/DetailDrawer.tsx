import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// The content shown when a section opens on the right.
type SidePanel = {
  title: string;
  count?: number;
  content: ReactNode;
  onClose: () => void;
};

type DetailDrawerProps = {
  ariaLabel: string;
  closing: boolean;

  // CreatorDrawer or BrandDrawer supplies its own profile content.
  children: ReactNode;

  // null or undefined means the drawer stays at its normal width.
  sidePanel?: SidePanel | null;
};

export function DetailDrawer({
  ariaLabel,
  closing,
  children,
  sidePanel,
}: DetailDrawerProps) {
  return (
    // The overlay does not block clicks on the results behind it.
    <div className="pointer-events-none fixed inset-0 z-60">
      <div
        data-rp-pop="drawer"
        role="dialog"
        aria-modal="false"
        aria-label={ariaLabel}
        className={cn(
          "pointer-events-auto absolute top-0 right-0 flex h-full max-w-[96vw] flex-col border-l border-rp-border bg-rp-surface shadow-rp",

          // Use the same width transition as your existing CreatorDrawer.
          "transition-[width] duration-200 ease-out",
          sidePanel ? "w-181" : "w-106",

          // The parent drawer still controls when the closing animation starts.
          closing ? "animate-rp-drawer-out" : "animate-rp-drawer",
        )}
      >
        {/* Main profile and optional side panel sit next to each other. */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Left: Creator or Brand content. */}
          <div
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden",
              sidePanel ? "w-106 shrink-0" : "w-full",
            )}
          >
            {children}
          </div>

          {/* Right: render only when a section has been selected. */}
          {sidePanel && (
            <aside className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-rp-border">

              {/* Shared section header. */}
              <div className="flex shrink-0 items-center gap-2 border-b border-rp-border px-4.5 py-3.75">
                <h3 className="min-w-0 flex-1 text-xs font-bold">
                  {sidePanel.title}
                </h3>

                {sidePanel.count !== undefined && (
                  <span className="rounded-full bg-rp-surface2 px-2 py-0.5 text-[10.5px] font-bold text-rp-muted">
                    {sidePanel.count}
                  </span>
                )}

                {/* Closes the section, not the entire drawer. */}
                <button
                  type="button"
                  onClick={sidePanel.onClose}
                  aria-label={`Close ${sidePanel.title}`}
                  className="rounded-lg p-1 text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Only the right-side content scrolls. */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4.5 py-3.75 scrollbar-thin">
                {sidePanel.content}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}