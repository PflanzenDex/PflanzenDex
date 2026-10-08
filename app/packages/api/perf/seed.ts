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

const dayOffset = (days: number) =>
  localToday(new Date(Date.now() - days * 86400000), "Europe/Berlin");

/** One account with zones, locations, species, `n` specimens, two measurements each, and a few wishes. */
export async function seedAccount(h: Harness, sub: string, n: number, tag: string): Promise<void> {
  const ok = async (r: ReturnType<Harness["call"]>): Promise<string> => {
    const reply = await r;
    if (reply.status >= 300) throw new Error(`seed failed: ${JSON.stringify(reply.body)}`);
    return reply.body["id"] as string;
  };
  const zones: string[] = [];
  for (const [name, luxCeiling] of ZONES)
    zones.push(await ok(h.call(sub, "POST", "/light-zones", { name, luxCeiling })));
  const locations: string[] = [];
  for (let i = 0; i < 8; i++)
    locations.push(
      await ok(
        h.call(sub, "POST", "/locations", {
          name: `Standort ${i}`,
          kind: i < 7 ? "indoor" : "outdoor",
          lightZoneId: zones[i % zones.length],
        }),
      ),
    );
  const species: string[] = [];
  for (let i = 0; i < SPECIES; i++)
    species.push(
      await ok(
        h.call(sub, "POST", "/species", {
          latinName: `Perfspecies${letters(tag)}${letters(String(i))} sp`,
          germanName: `Perfart ${tag} ${i}`,
          difficulty: 1 + (i % 3),
          standardLevel: 2 + (i % 3),
          lightDemandLux: 10000 + (i % 5) * 8000,
          growthMeasure: "rosette_diameter",
          etiolationSigns: "Rosette streckt sich.",
          successCriteria: "Dichte, flache Rosette.",
        }),
      ),
    );
  for (let i = 0; i < n; i++) {
    const created = await h.call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId: species[i % SPECIES],
      marker: `Topf ${i}`,
      ...(i % 10 === 9 ? {} : { locationId: locations[i % locations.length] }),
    });
    const id = created.body["id"] as string;
    if (!id) throw new Error(`specimen ${i} not created: ${JSON.stringify(created.body)}`);
    for (const [k, days] of [60, 20].entries())
      await h.call(sub, "POST", `/specimens/${id}/measurements`, {
        value: 8 + k * 1.5 + (i % 7) * 0.4,
        date: dayOffset(days),
      });
  }
  for (let i = 0; i < 10; i++)
    await h.call(sub, "POST", "/wishes", { name: `Perfgenus${i} species${i}` });
}
