import { useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  ChevronLeft,
  FileText,
  Megaphone,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SearchScope } from "@/types/api";
import { RailLabel } from "./filters/CreatorFilters";

import { useShellState } from "../store/shell-state";
import { useEffect, useRef } from "react";
import FilterSection from "./filters/FilterSection";

const SECTIONS: {
  scope: SearchScope;
  label: string;
  icon: LucideIcon;
  oneLiner: string;
}[] = [
    {
      scope: "creators",
      label: "Creators",
      icon: Users,
      oneLiner: "People who post — reach, topics and contacts.",
    },
    {
      scope: "brands",
      label: "Brands",
      icon: Building2,
      oneLiner: "Companies we sell to, and our history with them.",
    },
    {
      scope: "campaigns",
      label: "Campaigns",
      icon: Megaphone,
      oneLiner: "Work we are delivering, and how it is going.",
    },
    {
      scope: "pitches",
      label: "Pitches",
      icon: FileText,
      oneLiner: "Proposals we sent, and which ones we won.",
    },
  ];

export function DataRail() {
  const location = useLocation();
  const navigate = useNavigate();
  const shell = useShellState();
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPeekTimer = () => {
    if (peekTimer.current) {
      clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
  };

  useEffect(() => () => clearPeekTimer(), []);

  const activeScope = SECTIONS.find(
    (section) => location.pathname === `/search/${section.scope}`,
  )?.scope;

  // save the current url scope incluting its filters , search and sorting 
  // this hook logic lets users return to the same page results after switching scopes
  useEffect(() => {
    if (!activeScope) return;

    sessionStorage.setItem(
      `rp:search:${activeScope}`,
      `${location.pathname}${location.search}`,
    );
  }, [activeScope, location.pathname, location.search]);

  // restore the last visited url for this scope 
  
  const linkFor = (scope: SearchScope) =>
    sessionStorage.getItem(`rp:search:${scope}`) ?? `/search/${scope}`;
  return (
    <aside
      data-rp-pop="rail"
      onMouseEnter={() => {
        if (shell.railExpanded) return;
        clearPeekTimer();
        peekTimer.current = setTimeout(() => shell.setRailPeek(true), 150); // delay of 150 ms
      }}
      onMouseLeave={() => {
        clearPeekTimer();
        if (shell.railPeek) {
          shell.setRailPeek(false);
          shell.setOpenMenu(null);
        }
      }}
      className={cn(
        "relative z-40 box-border shrink-0 transition-[width] duration-200 ease-in-out",
        shell.railExpanded ? "w-53.5" : "w-14",
      )}
    >
      <div
        className={cn(
          "absolute top-0 left-0 flex h-full flex-col justify-between border-r border-rp-border bg-rp-bg",
          "transition-[width,box-shadow] duration-200 ease-in-out",
          shell.railOpen ? "w-53.5" : "w-14",
          shell.railPeek && !shell.railExpanded && "rounded-r-[14px] shadow-rp",
        )}
      >
        {/* ── data types ─────────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-col gap-0.75 px-1.75 pt-2.25">
          {SECTIONS.map(({ scope, label, icon: Icon, oneLiner }) => {
            const active = scope === activeScope;
            const count =
              active && shell.sectionCount !== null ? shell.sectionCount : null;


            return (
              <button
                key={scope}
                type="button"
                title={`${label} — ${oneLiner}`}
                onClick={() => navigate(linkFor(scope))}
                className={cn(
                  "relative flex cursor-pointer items-center gap-2.25 rounded-full text-[12.5px] transition-colors",
                  shell.railExpanded
                    ? "px-2.5 py-2.25"
                    : "justify-center overflow-visible px-2.5 py-2.25",
                  active
                    ? "bg-rp-primary-soft font-bold text-rp-primary"
                    : "font-medium text-rp-text hover:bg-rp-surface2",
                )}
              >
                <Icon className="size-4.5 shrink-0" />
                <RailLabel open={shell.railOpen}>{label}</RailLabel>
                {count !== null &&
                  (shell.railExpanded ? (
                    <span className="shrink-0 rounded-full bg-rp-primary-soft px-1.5 py-px text-[10.5px] font-bold tabular-nums text-rp-primary">
                      {compact(count)}
                    </span>
                  ) : // Ringed in the rail's background so it clears the glyph.
                    shell.railPeek ? (
                      <span className="shrink-0 rounded-full bg-rp-primary-soft px-1.5 py-px text-[10.5px] font-bold tabular-nums text-rp-primary">
                        {compact(count)}
                      </span>
                    ) : (
                      <span className="absolute -top-0.75 -right-0.75 min-w-3.75 rounded-full border-[1.5px] border-rp-bg bg-rp-primary px-0.75 text-center text-[9px] leading-3.5 font-bold tabular-nums text-rp-primary-fg">
                        {compact(count)}
                      </span>
                    ))}
              </button>
            );
          })}
        </div>
        {/* ── filters ────────────────────────────────────────────────────── */}
        {activeScope && (
          <FilterSection shellState={shell} scope={activeScope} />

        )}        {/* ── collapse ───────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={shell.toggleRail}
          title={
            shell.railExpanded ? "Collapse to icons" : "Show section names"
          }
          className="flex shrink-0 cursor-pointer items-center justify-center gap-1.75 border-t border-rp-border px-2 py-2.75 text-rp-muted hover:text-rp-text"
        >
          <ChevronLeft
            className={cn(
              "size-4 shrink-0 transition-transform",
              !shell.railExpanded && "rotate-180",
            )}
          />
          <span
            className={cn(
              "overflow-hidden text-[11.5px] font-semibold whitespace-nowrap",
              shell.railOpen
                ? "max-w-22.5 opacity-100 transition-[opacity,max-width] delay-50 duration-200 ease-out"
                : "max-w-0 opacity-0 transition-[opacity,max-width] duration-200 ease-out",
            )}
          >
            {shell.railExpanded ? "Collapse" : "Expand"}
          </span>
        </button>
      </div>
    </aside>
  );
}
