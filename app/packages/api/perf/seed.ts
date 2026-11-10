import { localToday } from "@pflanzendex/core";
import type { Harness } from "./harness.ts";

const ZONES = [
  ["Zone 1", 30000],
  ["Zone 2", 20000],
  ["Zone 3", 10000],
  ["Zone 4", 5000],
] as const;
const SPECIES = Number(process.env["PERF_SPECIES"] ?? 60); // distinct species held by the account
const letters = (text: string) => text.replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)] ?? "x");
const TAXA_GENERA = 50;
const TAXA_PER_GENUS = 10;
const TZ = "Europe/Berlin";
const WISHES = 10;

/** Shared catalog for Entdecken: `TAXA_GENERA` genera with `TAXA_PER_GENUS` resolved species each (assumed size). */
export async function seedTaxa(h: Harness): Promise<number> {
  await h.admin.query("delete from taxon where catalog_fingerprint = 'perf'");
  for (let g = 0; g < TAXA_GENERA; g++)
    for (let s = 0; s < TAXA_PER_GENUS; s++)
      await h.admin.query(
        `insert into taxon (latin_name, status, accepted_name, genus, family, catalog_fingerprint, built_at)
         values ($1, 'resolved', $1, $2, $3, 'perf', now())`,
        [`Perfgenus${g} species${s}`, `Perfgenus${g}`, `Perffamily${g % 10}`],
      );
  return TAXA_GENERA * TAXA_PER_GENUS;
}

const dayOffset = (days: number) => localToday(new Date(Date.now() - days * 86400000), TZ);

/** The account a seed writes for: the harness and the subject that signs in. */
type Account = { readonly h: Harness; readonly sub: string };

/**
 * Every seed write goes through here (NFR-12, #1234): a reply that is not 2xx throws with the method, the path and the
 * server's answer. Before, rejected measurements and wishes were skipped silently and the load measurement ran on an
 * account without any measurement.
 */
async function ok(
  account: Account,
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const reply = await account.h.call(account.sub, method, path, body);
  if (reply.status < 200 || reply.status >= 300)
    throw new Error(
      `seed ${method} ${path} failed with ${reply.status}: ${JSON.stringify(reply.body)}`,
    );
  return reply.body;
}

/**
 * Checks the rows of the seeded account (NFR-12, #1234): `n` specimens, two measurements per specimen and the wishes.
 * Counted with the superuser pool and filtered by the account of `sub`, so a write that was answered but not stored
 * (or was never sent) fails here instead of in the measurement.
 */
export async function assertSeeded(h: Harness, sub: string, n: number): Promise<void> {
  const { rows } = await h.admin.query<Record<"specimens" | "measurements" | "wishes", string>>(
    `select
       (select count(*) from specimen where account_id = a.id) as specimens,
       (select count(*) from measurement where account_id = a.id) as measurements,
       (select count(*) from wish where account_id = a.id) as wishes
     from account a where a.subject = $1`,
    [sub],
  );
  const got = rows[0];
  if (!got) throw new Error(`seed incomplete: no account for ${sub}`);
  const expected = { specimens: n, measurements: 2 * n, wishes: WISHES };
  const short = (Object.keys(expected) as (keyof typeof expected)[])
    .filter((k) => Number(got[k]) !== expected[k])
    .map((k) => `${k} ${got[k]} (expected ${expected[k]})`);
  if (short.length > 0) throw new Error(`seed incomplete for ${sub}: ${short.join(", ")}`);
}

/** One account with zones, locations, species, `n` specimens, two measurements each, and a few wishes. */
export async function seedAccount(h: Harness, sub: string, n: number, tag: string): Promise<void> {
  const account: Account = { h, sub };
  const zones: string[] = [];
  for (const [name, luxCeiling] of ZONES)
    zones.push((await ok(account, "POST", "/light-zones", { name, luxCeiling }))["id"] as string);
  const locations: string[] = [];
  for (let i = 0; i < 8; i++)
    locations.push(
      (
        await ok(account, "POST", "/locations", {
          name: `Standort ${i}`,
          kind: i < 7 ? "indoor" : "outdoor",
          lightZoneId: zones[i % zones.length],
        })
      )["id"] as string,
    );
  const species: string[] = [];
  for (let i = 0; i < SPECIES; i++)
    species.push(
      (
        await ok(account, "POST", "/species", {
          latinName: `Perfspecies${letters(tag)}${letters(String(i))} sp`,
          germanName: `Perfart ${tag} ${i}`,
          difficulty: 1 + (i % 3),
          standardLevel: 2 + (i % 3),
          lightDemandLux: 10000 + (i % 5) * 8000,
          growthMeasure: "rosette_diameter",
          etiolationSigns: "Rosette streckt sich.",
          successCriteria: "Dichte, flache Rosette.",
        })
      )["id"] as string,
    );
  for (let i = 0; i < n; i++) {
    const created = await ok(account, "POST", "/specimens", {
      timeZone: TZ,
      speciesId: species[i % SPECIES],
      marker: `Topf ${i}`,
      ...(i % 10 === 9 ? {} : { locationId: locations[i % locations.length] }),
    });
    const id = created["id"] as string;
    if (!id) throw new Error(`specimen ${i} not created: ${JSON.stringify(created)}`);
    // Past local dates only (60 and 20 days ago); values on the 0.5 grid of MEASUREMENT_LIMITS (US-WAC-01).
    for (const [k, days] of [60, 20].entries())
      await ok(account, "POST", `/specimens/${id}/measurements`, {
        timeZone: TZ,
        value: 8 + k * 1.5 + (i % 7) * 0.5,
        date: dayOffset(days),
      });
  }
  for (let i = 0; i < WISHES; i++)
    await ok(account, "POST", "/wishes", { name: `Perfgenus${i} species${i}` });
  await assertSeeded(h, sub, n);
}
