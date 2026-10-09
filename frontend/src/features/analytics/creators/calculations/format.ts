/** Indian digit grouping (1,23,456); an em dash for null. */
export function fmtN(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('en-IN');
}

export function fmtPct(x: number, digits = 1): string {
  return `${x.toFixed(digits)}%`;
}
