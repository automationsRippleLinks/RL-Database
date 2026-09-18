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
import type { FilterGroupKey } from '../hooks/filterModels/useCreatorFilterModel';


export interface ShellState {
  railExpanded: boolean;
  toggleRail: () => void;

  railPeek: boolean;
  setRailPeek: (peek: boolean) => void;

  railOpen: boolean;
  expandRail: () => void;

  openGroup: FilterGroupKey | null;
  setOpenGroup: (key: FilterGroupKey | null) => void;
  
  openMenu: string | null;
  setOpenMenu: (key: string | null) => void;

  sectionCount: number | null;
  setSectionCount: (count: number | null) => void;
}

const ShellContext = createContext<ShellState | null>(null);


export function ShellStateProvider({ children }: { children: ReactNode }) {
  const [railExpanded, setRailExpanded] = useState(false);
  const [railPeek, setRailPeek] = useState(false);
  const [openGroup, setOpenGroup] = useState<FilterGroupKey | null>('platform');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [sectionCount, setSectionCount] = useState<number | null>(null);


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
