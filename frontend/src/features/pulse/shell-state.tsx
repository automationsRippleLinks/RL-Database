import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useDismissable } from '@/hooks/useDismissable';
import type { FilterGroupKey } from './filters/useCreatorFilterModel';

/**
 * State the shell owns and the routed pages read.
 *
 * The rail sits outside the <Outlet>, so its pinned/peeked state has to live
 * above the router or it would reset on every navigation — collapsing the rail
 * and then opening a creator would silently un-collapse it.
 *
 * The result count goes the other way: the rail shows the active section's count
 * on its nav row, but only the page running the search knows it. The page
 * publishes it here rather than the rail re-deriving and re-running the query,
 * which is one query subscription instead of two and one definition of "the
 * count" instead of two that can disagree mid-fetch.
 */
interface ShellState {
  railExpanded: boolean;
  toggleRail: () => void;
  railPeek: boolean;
  setRailPeek: (peek: boolean) => void;
  /** Expanded or peeked: the panel is 214px wide and labels are legible. */
  railOpen: boolean;
  /** Pins the rail open — what a collapsed group glyph does when clicked. */
  expandRail: () => void;

  openGroup: FilterGroupKey | null;
  setOpenGroup: (key: FilterGroupKey | null) => void;
  /** Which filter popover (or the sort menu) is open; at most one at a time. */
  openMenu: string | null;
  setOpenMenu: (key: string | null) => void;

  sectionCount: number | null;
  setSectionCount: (count: number | null) => void;
}

const ShellContext = createContext<ShellState | null>(null);

const RAIL_STORAGE_KEY = 'rl-rail-expanded';

function readRailExpanded(): boolean {
  try {
    return localStorage.getItem(RAIL_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function ShellStateProvider({ children }: { children: ReactNode }) {
  const [railExpanded, setRailExpanded] = useState(readRailExpanded);
  const [railPeek, setRailPeek] = useState(false);
  const [openGroup, setOpenGroup] = useState<FilterGroupKey | null>('platform');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [sectionCount, setSectionCount] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, railExpanded ? '1' : '0');
    } catch {
      // Forgetting the rail's width between sessions is not worth failing over.
    }
  }, [railExpanded]);

  // Every popover this state opens — each filter control, and the sort menu —
  // tags its root `data-rp-pop="menu"`, so one listener closes whichever is
  // open. Registering it here rather than per-control means a control cannot
  // ship without dismissal, which is how the filter popovers came to need this.
  const closeMenu = useCallback(() => setOpenMenu(null), []);
  useDismissable('menu', openMenu !== null, closeMenu);

  const toggleRail = useCallback(() => {
    setRailExpanded((expanded) => !expanded);
    setRailPeek(false);
    setOpenMenu(null);
  }, []);

  const expandRail = useCallback(() => {
    setRailExpanded(true);
    setRailPeek(false);
    setOpenMenu(null);
  }, []);

  const value = useMemo<ShellState>(
    () => ({
      railExpanded,
      toggleRail,
      railPeek,
      setRailPeek,
      railOpen: railExpanded || railPeek,
      expandRail,
      openGroup,
      setOpenGroup,
      openMenu,
      setOpenMenu,
      sectionCount,
      setSectionCount,
    }),
    [railExpanded, toggleRail, railPeek, expandRail, openGroup, openMenu, sectionCount],
  );

  return <ShellContext value={value}>{children}</ShellContext>;
}

export function useShellState(): ShellState {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useShellState must be used inside <ShellStateProvider>');
  return context;
}

/**
 * Publishes the active section's result count to the rail, and clears it on the
 * way out so a stale count never sits under a section that isn't searching.
 */
export function useReportSectionCount(count: number | null | undefined) {
  const { setSectionCount } = useShellState();

  useEffect(() => {
    setSectionCount(count ?? null);
    return () => setSectionCount(null);
  }, [count, setSectionCount]);
}
