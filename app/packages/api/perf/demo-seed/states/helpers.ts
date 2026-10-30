import { speciesByLatin, type Ctx, type Id } from "../accounts/common/shared.ts";

// Lookups the states steps share. Every id is read through the API of the account the step acts as, so the
// row rules of the account apply to the lookup as well (P-04).
type Listed = { id: Id; speciesId: Id; marker: string | null };

/** The id of a specimen of `ctx` by Latin name and marker (`null` = unmarked). The base seed must have made it. */
export async function specimenOf(
  ctx: Ctx,
  latin: string,
  marker: string | null = null,
): Promise<Id> {
  const speciesId = (await speciesByLatin(ctx, [latin])).get(latin);
  const have = ((await ctx.api.ok(ctx.sub, "GET", "/specimens"))["specimens"] ?? []) as Listed[];
  const hit = have.find((s) => s.speciesId === speciesId && (s.marker ?? null) === marker);
  if (!hit)
    throw new Error(
      `demo seed states: ${ctx.name} has no specimen ${latin}${marker ? ` (${marker})` : ""}`,
    );
  return hit.id;
}

/** Location ids of `ctx` by name. */
export async function locationsOf(ctx: Ctx): Promise<Map<string, Id>> {
  const list = ((await ctx.api.ok(ctx.sub, "GET", "/locations"))["locations"] ?? []) as {
    id: Id;
    name: string;
  }[];
  return new Map(list.map((l) => [l.name, l.id]));
}

/** Light zone ids of `ctx` by name ("Zone 3" ...). */
export async function zonesOf(ctx: Ctx): Promise<Map<string, Id>> {
  const list = ((await ctx.api.ok(ctx.sub, "GET", "/light-zones"))["zones"] ?? []) as {
    id: Id;
    name: string;
  }[];
  return new Map(list.map((z) => [z.name, z.id]));
}

/** The first element of `list` that matches, or an error that names the step (nothing is swallowed, P-10). */
export function must<T>(list: readonly T[] | undefined, pick: (x: T) => boolean, what: string): T {
  const hit = (list ?? []).find(pick);
  if (!hit) throw new Error(`demo seed states: ${what} is missing`);
  return hit;
}
