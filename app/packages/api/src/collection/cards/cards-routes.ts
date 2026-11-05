import {
  appError,
  isTimeZone,
  localToday,
  parseCardPageQuery,
  specimenCardOf,
  specimenCardPage,
  specimenSummary,
  specimenTreatable,
  type CardPageDependencies,
} from "@pflanzendex/core";
import { Hono, type Context } from "hono";
import { errorBody, type AuthEnv } from "../../kernel";

/** `input.invalid` (400) naming the field that was refused (the client shows it, P-09). */
const badInput = (c: Context<AuthEnv>, field: string) =>
  c.json(
    errorBody(appError("input.invalid", { details: [{ field, code: "input.invalid" as const }] })),
    400,
  );

/**
 * The reads of the specimen cards (US-BES-06, FR-BES-23, NFR-12): one page of the list, the summary of all plants, the slim
 * treatment list and one card. Each runs as the account of the caller (P-04); a foreign ID is answered like an unknown one.
 * Mounted before `/specimens/:id` (`/specimens/cards` would be read as an ID there).
 */
export function cardRoutes(deps: CardPageDependencies, clock: () => Date): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  // "Today" is the local date of the requested time zone (the profile's, US-ACC-02; NFR-08), the time zone comes first.
  routes.get("/specimens/cards", async (c) => {
    const timeZone = c.req.query("timeZone");
    if (!isTimeZone(timeZone)) return badInput(c, "timeZone");
    const parsed = parseCardPageQuery({
      limit: c.req.query("limit"),
      after: c.req.query("after"),
      location: c.req.query("location"),
      species: c.req.query("species"),
    });
    if (!parsed.ok) return badInput(c, parsed.field);
    const page = await specimenCardPage(
      deps,
      c.get("account").id,
      localToday(clock(), timeZone),
      parsed.query,
    );
    return c.json(page);
  });
  // The counts over all active plants (not one page): groups, unplaced, last location, any measured (US-BES-06).
  routes.get("/specimens/cards/summary", async (c) =>
    c.json(await specimenSummary(deps, c.get("account").id)),
  );
  // The slim list for the treatment form (US-BEH-01): every active plant, cuttings included.
  routes.get("/specimens/treatable", async (c) =>
    c.json({ specimens: await specimenTreatable(deps, c.get("account").id) }),
  );
  // One card by ID, for the light zone form (US-LIC-02); archived, foreign and unknown IDs are all `specimen.not_found`.
  routes.get("/specimens/:id/card", async (c) => {
    const timeZone = c.req.query("timeZone");
    if (!isTimeZone(timeZone)) return badInput(c, "timeZone");
    const card = await specimenCardOf(
      deps,
      c.get("account").id,
      localToday(clock(), timeZone),
      c.req.param("id"),
    );
    return card ? c.json(card) : c.json(errorBody(appError("specimen.not_found")), 404);
  });
  return routes;
}
