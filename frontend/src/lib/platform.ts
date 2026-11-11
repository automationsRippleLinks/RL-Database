/**
 * Mac uses ⌘, everything else Ctrl. Detected once at module load — the OS
 * can't change mid-session.
 *
 * navigator.platform is deprecated but is the only check that still works
 * everywhere; userAgentData.platform isn't in Safari or Firefox. Falls back
 * to the userAgent string, then to Ctrl (the safer default — showing Ctrl on
 * a Mac is a small wrong; showing ⌘ on Windows, which is what happens now,
 * names a key that isn't on the keyboard).
 */
const isMac = (() => {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent ??
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
})();

/** Rendered form of the omnibox shortcut, e.g. "⌘ + K" or "Ctrl + K". */
export const SEARCH_SHORTCUT = isMac ? "⌘ + K" : "Ctrl + K";
