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