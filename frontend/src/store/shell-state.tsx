import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useDismissable } from '@/hooks/useDismissable';
import type { BrandRow, CreatorRow, CampaignRow, PitchRow } from '@/types/api';

/**
 * Each scope defines its own FilterGroupKey union (see the filter-model hooks
 * under hooks/filterModels) because their groups genuinely differ — a brand
 * has no "reach" group, a creator has no "org_type" group. The rail itself
 * just needs *a* key to track which group is open, so this stays generic
 * rather than importing one scope's union and rejecting every other scope's
 * values.
 */
export type RailGroupKey = string;
// ── BRAND SELECTION ────────────────────────────────────────────
type PickedBrands = Record<string, BrandRow>;
type PickedCreators = Record<string, CreatorRow>
type PickedCampaigns = Record<string, CampaignRow>
type PickedPitches = Record<string, PitchRow>

export interface ShellState {
  railExpanded: boolean;
  toggleRail: () => void;

  railPeek: boolean;
  setRailPeek: (peek: boolean) => void;

  railOpen: boolean;
  expandRail: () => void;

  openGroup: RailGroupKey | null;
  setOpenGroup: (key: RailGroupKey | null) => void;

  openMenu: string | null;
  setOpenMenu: (key: string | null) => void;

  sectionCount: number | null;
  setSectionCount: (count: number | null) => void;

  // ── BRAND SELECTION ACROSS PAGE NAVIGATION ───────────────────
  pickedBrands: PickedBrands;
  setPickedBrands: Dispatch<SetStateAction<PickedBrands>>;
  // ── CREATORS SELECTION ACROSS PAGE NAVIGATION ───────────────────
  pickedCreators: PickedCreators;
  setPickedCreators: Dispatch<SetStateAction<PickedCreators>>;
  // ── CAMPAIGNS SELECTION ACROSS PAGE NAVIGATION ───────────────────
  pickedCampaigns: PickedCampaigns;
  setPickedCampaigns: Dispatch<SetStateAction<PickedCampaigns>>;
  // ── PITCHES SELECTION ACROSS PAGE NAVIGATION ───────────────────
  pickedPitches: PickedPitches;
  setPickedPitches: Dispatch<SetStateAction<PickedPitches>>;


}

const ShellContext = createContext<ShellState | null>(null);


export function ShellStateProvider({ children }: { children: ReactNode }) {
  const [railExpanded, setRailExpanded] = useState(false);
  const [railPeek, setRailPeek] = useState(false);
  const [openGroup, setOpenGroup] = useState<RailGroupKey | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [sectionCount, setSectionCount] = useState<number | null>(null);
  // ── BRAND SELECTION ────────────────────────────────────────────
  // Stored above the search pages so changing routes doesn't clear it.
  const [pickedBrands, setPickedBrands] = useState<PickedBrands>({});
  // ── CREATOR SELECTION ──────────────────────────────────────────
  const [pickedCreators, setPickedCreators] = useState<PickedCreators>({});
  // ── CAMPAIGNS SELECTION ──────────────────────────────────────────
  const [pickedCampaigns, setPickedCampaigns] = useState<PickedCampaigns>({});
  // ── PITCHES SELECTION ──────────────────────────────────────────
  const [pickedPitches, setPickedPitches] = useState<PickedPitches>({});


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
      pickedBrands,
      setPickedBrands,
      pickedCreators,
      setPickedCreators,
      pickedCampaigns,
      setPickedCampaigns,
      pickedPitches,
      setPickedPitches
    }),
    [railExpanded, toggleRail, railPeek, expandRail, openGroup, openMenu, sectionCount, pickedBrands, pickedCreators, pickedCampaigns, pickedPitches],
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
