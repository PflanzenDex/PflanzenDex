import type { SharingRow, SharingStore } from "../types";

/** What the keeper has decided: only the shared specimens have a row, every other one is private (US-SOZ-04). */
export async function sharingList(
  deps: { sharing: SharingStore },
  userId: string,
): Promise<{ shared: readonly SharingRow[] }> {
  return { shared: await deps.sharing.list(userId) };
}
