import { localToday } from "@pflanzendex/core";
import type { Caller } from "../../access/caller.ts";

// Building blocks every demo account uses. Each helper looks first and creates only what is missing, so the whole
// seed can run again and again (idempotent); everything goes through the API routes (core operations, row security).
export type Ctx = { api: Caller; sub: string; name: string; log: (message: string) => void };
export type Id = string;

export const TZ = "Europe/Berlin";

/** Calendar date `days` before today in the keeper's time zone (NFR-08). */
export const daysAgo = (days: number): string =>
  localToday(new Date(Date.now() - days * 86_400_000), TZ);

type Named = { id: Id; name: string };

export async function setUp(ctx: Ctx, displayName: string, style: "few" | "many"): Promise<void> {
  const { api, sub } = ctx;
  await api.ok(sub, "PUT", "/account/profile", {
    displayName,
    timeZone: TZ,
    everythingPrivate: false,
    noRecommendations: false,
    notifications: {},
  });
  await api.ok(sub, "PUT", "/onboarding/style", { style, timeZone: TZ });
}

/** Four default light zones when the account has none yet; returns the zones by name. */
export async function ensureZones(ctx: Ctx): Promise<Map<string, Id>> {
  const { api, sub } = ctx;
  let zones = (await api.ok(sub, "GET", "/light-zones"))["zones"] as Named[];
  if (zones.length === 0) {
    await api.ok(sub, "POST", "/light-zones/defaults");
    zones = (await api.ok(sub, "GET", "/light-zones"))["zones"] as Named[];
  }
  return new Map(zones.map((z) => [z.name, z.id]));
}

export type LocationDef = { name: string; zone: string; kind?: "indoor" | "outdoor" };

export async function ensureLocations(
  ctx: Ctx,
  zones: Map<string, Id>,
  defs: readonly LocationDef[],
): Promise<Map<string, Id>> {
  const { api, sub } = ctx;
  const have = (await api.ok(sub, "GET", "/locations"))["locations"] as Named[];
  const byName = new Map(have.map((l) => [l.name, l.id]));
  for (const d of defs) {
    if (byName.has(d.name)) continue;
    const zone = zones.get(d.zone);
    if (!zone) throw new Error(`demo seed: unknown light zone '${d.zone}'`);
    const made = await api.ok(sub, "POST", "/locations", {
      name: d.name,
      kind: d.kind ?? "indoor",
      lightZoneId: zone,
    });
    byName.set(d.name, made["id"] as Id);
  }
  return byName;
}

/** Species ids of the seeded catalog by Latin name (the catalog seed must have run). */
export async function speciesByLatin(ctx: Ctx, latin: readonly string[]): Promise<Map<string, Id>> {
  const out = new Map<string, Id>();
  for (const name of latin) {
    const r = (await ctx.api.ok(ctx.sub, "GET", `/species?q=${encodeURIComponent(name)}`))[
      "species"
    ] as { id: Id; latinName: string }[];
    const hit = r.find((s) => s.latinName === name);
    if (!hit)
      throw new Error(`demo seed: species '${name}' is not in the catalog (run seed:catalog)`);
    out.set(name, hit.id);
  }
  return out;
}

export type SpecimenDef = {
  latin: string;
  marker?: string;
  location?: string;
  status?: "cutting";
  caughtDaysAgo?: number;
};

/** Specimens by `latin` + marker key; existing ones (same species and marker) are kept. */
export async function ensureSpecimens(
  ctx: Ctx,
  species: Map<string, Id>,
  locations: Map<string, Id>,
  defs: readonly SpecimenDef[],
): Promise<Map<string, Id>> {
  const { api, sub } = ctx;
  const have = (await api.ok(sub, "GET", "/specimens"))["specimens"] as {
    id: Id;
    speciesId: Id;
    marker: string | null;
  }[];
  const out = new Map<string, Id>();
  for (const d of defs) {
    const speciesId = species.get(d.latin);
    if (!speciesId) throw new Error(`demo seed: no species id for '${d.latin}'`);
    const key = d.marker ? `${d.latin}|${d.marker}` : d.latin;
    const found = have.find((s) => s.speciesId === speciesId && s.marker === (d.marker ?? null));
    if (found) {
      out.set(key, found.id);
      continue;
    }
    const locationId = d.location ? locations.get(d.location) : undefined;
    const made = await api.ok(sub, "POST", "/specimens", {
      speciesId,
      timeZone: TZ,
      ...(d.marker ? { marker: d.marker } : {}),
      ...(locationId ? { locationId } : {}),
      ...(d.status ? { status: d.status } : {}),
      ...(d.caughtDaysAgo ? { catchDate: daysAgo(d.caughtDaysAgo) } : {}),
    });
    out.set(key, made["id"] as Id);
    have.push({ id: made["id"] as Id, speciesId, marker: d.marker ?? null });
  }
  return out;
}

/** A measurement series (value per date) unless the specimen already has measurements. Returns true when written. */
export async function ensureMeasurements(
  ctx: Ctx,
  specimenId: Id,
  series: readonly (readonly [number, number])[],
): Promise<boolean> {
  const { api, sub } = ctx;
  const existing = await api.ok(sub, "GET", `/specimens/${specimenId}/measurements?timeZone=${TZ}`);
  if (existing["last"]) return false;
  for (const [days, value] of series)
    await api.ok(sub, "POST", `/specimens/${specimenId}/measurements`, {
      timeZone: TZ,
      date: daysAgo(days),
      value,
    });
  return true;
}

/** Wishes by name; existing ones are kept. Returns the ids by name. */
export async function ensureWishes(
  ctx: Ctx,
  defs: readonly { name: string; zone?: Id }[],
): Promise<Map<string, Id>> {
  const { api, sub } = ctx;
  const read = async () => {
    const r = await api.ok(sub, "GET", "/wishes/candidates");
    return (r["candidates"] as { id: Id; name: string }[]) ?? [];
  };
  const out = new Map((await read()).map((w) => [w.name, w.id]));
  for (const d of defs) {
    if (out.has(d.name)) continue;
    const made = await api.ok(sub, "POST", "/wishes", {
      name: d.name,
      ...(d.zone ? { targetZoneId: d.zone } : {}),
    });
    out.set(d.name, made["id"] as Id);
  }
  return out;
}

export type EquipmentDef = {
  type: string;
  name: string;
  fields?: Record<string, unknown>;
  /** Follow-up writes (lamp data, supply, ...); run only when the item is created now. */
  after?: (id: Id) => Promise<void>;
};

/** Equipment by name; existing items are kept, follow-up writes run only for new ones. */
export async function ensureEquipment(
  ctx: Ctx,
  defs: readonly EquipmentDef[],
): Promise<Map<string, Id>> {
  const { api, sub } = ctx;
  const have = (await api.ok(sub, "GET", "/equipment"))["equipment"] as Named[];
  const out = new Map(have.map((e) => [e.name, e.id]));
  for (const d of defs) {
    if (out.has(d.name)) continue;
    const made = await api.ok(sub, "POST", "/equipment", {
      type: d.type,
      name: d.name,
      ...d.fields,
    });
    const id = (made["equipment"] as Named).id;
    out.set(d.name, id);
    await d.after?.(id);
  }
  return out;
}

/** Marks specimens as shared with friends (US-SOZ-04); private stays the default for everything else. */
export async function shareSpecimens(ctx: Ctx, ids: readonly Id[]): Promise<void> {
  for (const id of ids)
    await ctx.api.ok(ctx.sub, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
}
