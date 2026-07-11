/**
 * Natural title ordering: "1. xxx" < "2. xxx" < "10. xxx" (plain string sort
 * puts "10" before "2", which is what the server returns for title sorts).
 */
const collator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

export function sortDocsByTitle<T extends { title?: string | null }>(
  docs: T[],
  direction: "asc" | "desc" = "asc",
): T[] {
  const sign = direction === "desc" ? -1 : 1;
  return [...docs].sort(
    (a, b) => sign * collator.compare(a.title ?? "", b.title ?? ""),
  );
}
