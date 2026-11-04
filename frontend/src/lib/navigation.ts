/**
 * Attach to any navigate()/<Link> that leads into a detail page, so the page
 * on the receiving end (via useBackTo) can tell it was reached by clicking
 * through the app, not a direct link — e.g.
 *   navigate(`/brands/${row.id}`, withBackState(location))
 *   <Link to={`/campaigns/${id}`} state={withBackState(location).state}>
 *
 * Takes a plain { pathname, search } rather than react-router's Location type
 * so it also accepts window.location directly — needed for column definitions
 * that live at module scope (outside a component), where useLocation() can't
 * be called. The value itself is only for debugging; useBackTo's real
 * back-navigation is done with navigate(-1), which doesn't need the path —
 * only presence matters for that check.
 */
export function withBackState(location: { pathname: string; search: string }) {
  return { state: { from: `${location.pathname}${location.search}` } };
}

/**
 * Like withBackState, plus a name for where you came from, so the page you land on
 * can offer "← Back to <label>" (see components/BackLink.tsx). Use it on every link
 * that jumps between areas: a list to its Missing info, Missing info back to the list…
 */
export function backState(location: { pathname: string; search: string }, label: string) {
  return { from: `${location.pathname}${location.search}`, fromLabel: label };
}

/** A short name for the page you are on, for "Back to …" when a link has no better one. */
export function pageLabel(location: { pathname: string; search: string }): string {
  const p = location.pathname.replace(/\/+$/, '');
  const inList = new URLSearchParams(location.search).has('list');
  if (p === '/search/creators') return inList ? 'the list' : 'Creators';
  if (p.startsWith('/search/')) return p.slice(8).replace(/^\w/, (c) => c.toUpperCase());
  if (p === '/analytics/creators') return 'Missing info';
  if (p === '/analytics') return 'Analytics';
  if (p === '/lists') return 'Lists';
  return 'the previous page';
}