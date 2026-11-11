import { useEffect } from "react";

const SUFFIX = "Ripple Pulse";

/** Sets the tab title, restoring the bare app name on unmount so a stale
 *  page title can't outlive the page that set it. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = SUFFIX;
    };
  }, [title]);
}
