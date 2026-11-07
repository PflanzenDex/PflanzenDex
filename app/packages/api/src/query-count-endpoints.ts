import type { Hono } from "hono";
import { TZ, type SeedIds } from "./query-count-seed-test-helpers";

// US-QG-07: the GET routes the gate calls, by route pattern as Hono lists them. Each entry gives the query the handler
// needs (`timeZone` wherever it reads it, NFR-08). Path params take a seeded id of the measured keeper (`paramOf`).
type Query = (ids: SeedIds) => Record<string, string>;
const none: Query = () => ({});
const zone: Query = () => ({ timeZone: TZ });
const ofSpecimen: Query = (ids) => ({ specimenId: ids.specimen, timeZone: TZ });

export const MEASURED: Record<string, Query> = {
  "/account": none,
  "/account/deletion": none,
  "/account/export": none,
  "/account/profile": none,
  "/achievements": zone,
  "/achievements/anniversaries": zone,
  "/achievements/growth/:specimenId": none,
  "/achievements/news": zone,
  "/achievements/rhythm": zone,
  "/achievements/settings": none,
  "/achievements/year": zone,
  "/care-phases": zone,
  "/care-profiles": none,
  "/catalog/corrections/mine": none,
  "/catalog/history/:speciesId/:field": none,
  "/catalog/species/:speciesId/corrections": none,
  "/discover/suggestions": zone,
  "/equipment": none,
  "/equipment/agents": none,
  "/equipment/checks-due": zone,
  "/equipment/friends/:id": none,
  "/equipment/lamps": none,
  "/equipment/needs": none,
  "/equipment/recommendations": none,
  "/equipment/sensors": none,
  "/equipment/sharing": none,
  "/equipment/wishes": none,
  "/equipment/zones": none,
  "/exchange/match": zone,
  "/exchange/offers": zone,
  "/feed": zone,
  "/feed/banner": none,
  "/friends": none,
  "/friends/:id/collection": none,
  "/friends/:id/shared": none,
  "/friends/requests": none,
  "/hints": none,
  "/light-zones": none,
  "/light-zones/derivation": () => ({
    lightDemandLux: "40000",
    standardLevel: "3",
    softLeaf: "false",
  }),
  "/locations": none,
  "/offers": zone,
  "/offers/preview": ofSpecimen,
  "/onboarding/hints": zone,
  "/onboarding/style": none,
  "/onboarding/unlocks": zone,
  "/onboarding/unlocks/:id": zone,
  "/pokedex/cards": zone,
  "/pokedex/ownership": zone,
  "/pokedex/seen": none,
  "/pokedex/tree": none,
  "/reminders": none,
  "/reminders/settings": none,
  "/reminders/subscriptions": none,
  "/sharing": none,
  "/species": () => ({ q: "" }),
  "/species/:id": none,
  "/specimens": none,
  "/specimens/archived": none,
  "/specimens/cards": zone,
  "/specimens/cards/summary": none,
  "/specimens/count": none,
  "/specimens/difficulty": none,
  "/specimens/distribution": none,
  "/specimens/hints": none,
  "/specimens/light-overview": none,
  "/specimens/treatable": none,
  "/specimens/:id": none,
  "/specimens/:id/card": zone,
  "/specimens/:id/fertilizing": none,
  "/specimens/:id/leaves": none,
  "/specimens/:id/measurements": zone,
  "/specimens/:id/repot-plan": zone,
  "/swaps": none,
  "/swaps/history": none,
  "/today": zone,
  "/treatments": zone,
  "/treatments/history": ofSpecimen,
  "/watering/due": zone,
  "/wishes/bought": none,
  "/wishes/candidates": none,
  "/wishes/discarded": none,
  "/wishes/visible-to-friends": none,
};

/** The seeded value of a path param, by its name or by the route prefix. Unknown params throw, so a new route with a
 * param the seed does not know fails at once. */
function paramOf(pattern: string, name: string, ids: SeedIds): string {
  if (name === "field") return "germanName";
  if (pattern.startsWith("/onboarding/unlocks/")) return "today";
  if (name.startsWith("species") || pattern.startsWith("/species/")) return ids.species;
  if (name.startsWith("specimen") || pattern.startsWith("/specimens/")) return ids.specimen;
  if (pattern.startsWith("/friends/") || pattern.startsWith("/equipment/friends/"))
    return ids.friend;
  throw new Error(`no seeded value for :${name} of ${pattern}`);
}

/** The request path of a measured route pattern with the seeded ids and its query. */
export function requestPath(pattern: string, ids: SeedIds): string {
  const query = MEASURED[pattern];
  if (!query) throw new Error(`${pattern} is not measured`);
  const path = pattern.replace(/:(\w+)/g, (_, name: string) =>
    encodeURIComponent(paramOf(pattern, name, ids)),
  );
  const search = new URLSearchParams(query(ids)).toString();
  return search === "" ? path : `${path}?${search}`;
}

/** The GET routes of the app as Hono registers them: one per path, middleware (`/*`) left out. */
export function getRoutes(app: Hono): string[] {
  const paths = app.routes
    .filter((r) => r.method === "GET" && !r.path.endsWith("/*"))
    .map((r) => r.path);
  return [...new Set(paths)];
}
