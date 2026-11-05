/**
 * The rows of several specimens, grouped per specimen (NFR-12: one query for all IDs). Each group keeps the order of the
 * rows, so the statement's sort order is the order of every group.
 */
export function groupBySpecimen<T extends { readonly specimenId: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const own = grouped.get(row.specimenId);
    if (own) own.push(row);
    else grouped.set(row.specimenId, [row]);
  }
  return grouped;
}
