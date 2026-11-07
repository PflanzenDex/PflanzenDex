// Test double of one plant's repot reads and writes (US-BES-19): the plan, the observations and the repot, with the card
// reads of the collection page around them. The fake keeps the observations between the reads, as the API does.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import type { RepotSign, SpecimenCard } from "@pflanzendex/core";
import { CollectionPage } from "../../../../collection-page/collection-page";
import { EMPTY_DISTRIBUTION } from "../../../../insights/distribution-test-helpers";
import { answerCardRead } from "../../../../specimens/tests/cards-fake";
import type { RepotPlanView } from "../../repot-api";

/** The plant of the tests: a plant, not a cutting, with no pot before a test names one. */
export const CARD: SpecimenCard = {
  id: "e1",
  name: "Bogenhanf",
  speciesId: "a1",
  marker: null,
  speciesName: "Dracaena trifasciata",
  status: "plant",
  location: "Regal Süd",
  lightZone: "Zone 3",
  lightZoneSource: "location",
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  provenance: null,
  moreTreatments: 0,
};

/** A plan without hints: repotted in March, growth phase, no pot (US-BES-19). */
export const PLAN: RepotPlanView = {
  specimenId: "e1",
  status: "plant",
  hidden: false,
  equipmentOff: false,
  hints: [],
  lastRepot: "2026-03-05",
  phase: "growth",
  seasonAdvice: null,
  currentPot: null,
  freePots: [],
};

export type Post = { path: string; body: Record<string, unknown> };
type Refusal = { status: number; body: unknown };

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

/** The day an observation is ticked in the tests (the keeper's local day of this suite). */
const TICKED_ON = "2026-11-07";

/** The plan with one observation ticked or cleared (US-BES-19): a sign hint is derived from the ticks. */
function withSign(plan: RepotPlanView, sign: RepotSign, ticked: boolean): RepotPlanView {
  const rest = plan.hints.filter((h) => h.reason !== sign);
  return {
    ...plan,
    hints: ticked
      ? [...rest, { reason: sign, tickedOn: TICKED_ON, source: "keeper_observation" }]
      : rest,
  };
}

/**
 * The API of the plant: the plan (`GET /specimens/e1/repot-plan`), the observations (`POST .../repot-signs`) and the repot
 * (`POST .../repot`), plus the card reads of the collection page. The refusal options answer the writes with an error.
 * Returns the writes that were sent.
 */
export function fakeRepotServer(
  opt: {
    plan?: Partial<RepotPlanView>;
    card?: Partial<SpecimenCard>;
    planFails?: boolean;
    signRefusal?: Refusal;
    repotRefusal?: Refusal;
  } = {},
): Post[] {
  let plan: RepotPlanView = { ...PLAN, ...opt.plan };
  const card: SpecimenCard = { ...CARD, ...opt.card };
  const posts: Post[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      const path = u.pathname;
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push({ path, body });
        if (path === "/specimens/e1/repot-signs") {
          if (opt.signRefusal) return json(opt.signRefusal.status, opt.signRefusal.body);
          plan = withSign(plan, body["sign"] as RepotSign, body["ticked"] === true);
          return json(200, { specimenId: "e1", signs: [] });
        }
        if (path === "/specimens/e1/repot") {
          if (opt.repotRefusal) return json(opt.repotRefusal.status, opt.repotRefusal.body);
          return json(200, { id: "e1", status: "plant", repottedAt: TICKED_ON, pot: null });
        }
        return json(404, {});
      }
      if (path === "/specimens/e1/repot-plan")
        return opt.planFails
          ? json(500, { error: { code: "system.unexpected", text: "Unerwartet." } })
          : json(200, plan);
      if (path === "/locations") return json(200, { locations: [] });
      if (path === "/specimens/archived") return json(200, { archived: [] });
      if (path === "/specimens/distribution") return json(200, EMPTY_DISTRIBUTION);
      return answerCardRead(u, [card]) ?? json(404, {});
    }),
  );
  return posts;
}

/** The collection page with the plant of the fake server. */
export function renderCollection() {
  return render(
    <MemoryRouter>
      <CollectionPage
        api="http://api"
        token={async () => "tok"}
        newSpecies={null}
        onSpeciesChoose={vi.fn()}
        onCompleted={vi.fn()}
      />
    </MemoryRouter>,
  );
}

/** The reads of the plan the page sent so far. */
export const planReads = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => new URL(String(url)).pathname === "/specimens/e1/repot-plan");
