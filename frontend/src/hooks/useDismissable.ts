import { useEffect } from 'react';

/**
 * One capture-phase mousedown listener closes every transient surface: the
 * creator drawer, the account menu, the sort menu, each filter popover and the
 * search suggestions.
 *
 * Capture phase matters. These surfaces sit over a table whose rows open the
 * drawer on click, so a bubble-phase listener would let the row underneath a
 * closing popover fire first and swap the drawer's contents as a side effect of
 * dismissing a menu. Capturing runs before any of that.
 *
 * A surface opts in by tagging its own root `data-rp-pop="<name>"`; a mousedown
 * inside that subtree is "inside" and leaves it alone. Portalled content (Radix
 * dialogs) is deliberately not tagged — it manages its own dismissal.
 *
 * Several names can be passed, for a surface that should survive clicks on
 * something other than itself. The drawer needs exactly that: a click on a
 * results row has to swap the record it shows, not dismiss it.
 */
export function useDismissOnOutside(
  name: string | string[],
  open: boolean,
  onDismiss: () => void,
) {
  const selector = (Array.isArray(name) ? name : [name])
    .map((one) => `[data-rp-pop="${one}"]`)
    .join(',');

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.(selector)) return;
      onDismiss();
    };

    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [selector, open, onDismiss]);
}

/** Escape closes the same surfaces, and is a separate listener by design. */
export function useEscape(open: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onEscape]);
}

/** The pair, which is what almost every caller wants. */
export function useDismissable(name: string | string[], open: boolean, onDismiss: () => void) {
  useDismissOnOutside(name, open, onDismiss);
  useEscape(open, onDismiss);
}
