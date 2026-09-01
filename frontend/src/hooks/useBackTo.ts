import { useLocation, useNavigate } from 'react-router-dom';

/**
 * "Back" for a detail page reached via in-app navigation. `navigate(-1)` walks
 * the real browser history entry rather than reconstructing a path, so it
 * correctly restores whatever that entry actually had (filters, pagination, a
 * deeper chain of detail pages) with no per-page bookkeeping.
 *
 * `location.state?.from` is only ever used as a presence check: if it's
 * missing, this page wasn't reached by clicking through the app in this tab
 * (a direct link, a refresh, a new tab) and there is no real "back" entry to
 * return to, so `fallback` is used instead of risking navigate(-1) leaving
 * the app entirely.
 *
 * Every navigation into a detail page must attach `state: { from: ... }` (see
 * withBackState in lib/navigation.ts) for this to recognize an in-app arrival.
 */
export function useBackTo(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();

  return () => {
    if (location.state?.from) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };
}