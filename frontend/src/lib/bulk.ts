/** Most items one bulk search will take. The backend applies the same cap. */
export const MAX_BULK_ITEMS = 500;
/** True when the text has more than one line, which means it is a pasted list. */
export const isBulkText = (text: string): boolean => /[\r\n]/.test(text);
/**
 * Turns pasted text into a clean list: split on new lines, commas, semicolons
 * and tabs, drop invisible characters and extra spaces, remove repeats
 **/
export function splitItems(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of text.split(/[\r\n,;\t]+/)) {
    const item = raw
      .replace(/\p{Cf}/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .trim();
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  }
  return items.slice(0, MAX_BULK_ITEMS);
}

const BULK_PREFIX = "bulk:";
const storageKey = (id: string) => `rp-bulk-${id}`;

/** True when the search text is a short code that stands for a saved list. */
export const isBulkToken = (q: string): boolean => q.startsWith(BULK_PREFIX);

/** Keeps the list in this browser tab and returns the short code for the page link. */
export function saveBulk(items: string[]): string {
  const id = Date.now().toString(36);
  try {
    sessionStorage.setItem(storageKey(id), items.join("\n"));
  } catch {
    /* storage blocked: the list is lost on refresh */
  }
  return BULK_PREFIX + id;
}

/** Gives back the list for a code, or '' when this tab no longer has it. */
export function loadBulk(token: string): string {
  try {
    return (
      sessionStorage.getItem(storageKey(token.slice(BULK_PREFIX.length))) ?? ""
    );
  } catch {
    return "";
  }
}
