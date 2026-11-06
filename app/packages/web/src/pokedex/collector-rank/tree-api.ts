import type { PokedexTree } from "@pflanzendex/core";
import { call, type Response } from "../../shared/data";

/** The query key of the taxonomy tree: the progress row and the progress layer read the same copy (US-POK-10). */
export const TREE_KEY = ["pokedex", "tree"] as const;

/**
 * Loads the taxonomy tree for the progress (US-POK-10, US-POK-11): every species with its family, genus, order and German
 * name. `null` before the first taxonomy build, so the progress says it is not built yet (P-08). The tree is shared
 * catalog data and holds no user data.
 */
export async function loadTree(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<PokedexTree | null>> {
  const r = await call<{ tree: PokedexTree | null }>(fetchFn, `${api}/pokedex/tree`, token);
  return r.ok ? { ok: true, value: r.value.tree } : r;
}
