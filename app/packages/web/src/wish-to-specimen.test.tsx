// @vitest-environment jsdom
import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The sign-in service is a foreign system: UserManager is replaced, app and modules run for real.
const mgr = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("oidc-client-ts", () => ({
  WebStorageStateStore: vi.fn(),
  UserManager: class {
    settings = { authority: "http://auth/realm" };
    events = {
      addUserSignedOut: () => undefined,
      removeUserSignedOut: () => undefined,
      addSilentRenewError: () => undefined,
      removeSilentRenewError: () => undefined,
    };
    getUser = mgr.getUser;
    removeUser = vi.fn(async () => undefined);
    signinRedirect = vi.fn(async () => undefined);
    signoutRedirect = vi.fn(async () => undefined);
  },
}));

import { App } from "./App";
import { EMPTY_DISTRIBUTION } from "./collection/distribution-test-helpers";

// US-WUN-05: after "Gekauft" the app opens the creation of a specimen with the species preselected from the catalog, or
// the catalog search with the wish name; the wish is linked to the specimen it became ("bought → specimen").
// The way loads its parts on demand (DS-08); on a busy machine (coverage run) a chunk can take longer than one second.
configure({ asyncUtilTimeout: 5000 });

const response = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const WISH = { id: "w1", name: "Dracaena trifasciata", title: "Dracaena trifasciata" };
const SPECIES = {
  id: "a1",
  latinName: "Dracaena trifasciata",
  germanName: null,
  synonyms: [],
  difficulty: 1,
  standardLevel: 2,
  lightDemandLux: 15000,
  growthMeasure: "height",
  etiolationSigns: "x",
  successCriteria: "y",
  reviewStatus: "reviewed",
};
const SPECIMEN = {
  id: "s1",
  name: "Dracaena trifasciata",
  speciesId: "a1",
  status: "plant",
  locationId: null,
  marker: null,
};
const LINK_HINT = "Der Wunsch „Dracaena trifasciata“ ist mit deinem neuen Exemplar verknüpft.";

interface Options {
  inCatalog?: boolean;
  linkFails?: boolean;
}
const READS: Record<string, unknown> = {
  "/account": {
    id: "1",
    email: "a@example.test",
    displayName: "Lena",
    emailConfirmed: true,
    mayShareWithFriends: true,
  },
  "/wishes/candidates": {
    candidates: [],
    zones: [],
    hint: { text: "Keine offenen Kandidaten.", nextAction: "Erfasse einen Wunsch." },
    duplicates: [],
    duplicateHint: null,
    replenishment: {
      buffer: 2,
      zones: [],
      actions: { discover: false, suggestions: false },
      nextAction: null,
    },
  },
  "/wishes/discarded": {
    discarded: [],
    hint: { text: "Kein Wunsch ist verworfen.", nextAction: "Verwerfen." },
  },
  "/species/a1": SPECIES,
  "/locations": { locations: [] },
  "/light-zones": { zones: [] },
  "/specimens/count": { count: 0, archived: 0 },
  "/specimens/cards": { cards: [] },
  "/specimens/archived": { archived: [] },
  "/specimens/distribution": EMPTY_DISTRIBUTION,
};

function server(o: Options = {}) {
  let linked = false;
  const answer = (path: string, post: boolean): Promise<Response> => {
    if (post && path === "/wishes/w1/specimen") {
      if (o.linkFails)
        return response(409, { error: { code: "wish.already_linked", text: "roh vom Server" } });
      linked = true;
      return response(200, { changed: true, hint: { text: LINK_HINT } });
    }
    if (post && path === "/specimens") return response(201, SPECIMEN);
    if (path === "/wishes/bought")
      return response(200, {
        bought: [{ ...WISH, specimenId: linked ? "s1" : null }],
        hint: { text: "1 Wunsch ist als gekauft vermerkt.", nextAction: "Lege ihn an." },
      });
    if (path === "/species")
      return response(200, { species: o.inCatalog === false ? [] : [{ ...SPECIES, hit: null }] });
    return path in READS ? response(200, READS[path]) : response(404);
  };
  const fetchFn = vi.fn<typeof fetch>(async (url, init) =>
    answer(new URL(String(url)).pathname, init?.method === "POST"),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const sent = (f: ReturnType<typeof server>, path: string) =>
  f.mock.calls.filter(([u, i]) => i?.method === "POST" && new URL(String(u)).pathname === path);

/** The main navigation of the shared shell lists every destination as a link (DS-25). */
const tab = (name: string) =>
  within(screen.getByRole("navigation", { name: "Hauptnavigation" })).getByRole("link", { name });

const open = async () => {
  mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
  render(
    <MemoryRouter initialEntries={["/wishlist"]}>
      <App />
    </MemoryRouter>,
  );
  const list = await screen.findByRole("list", { name: "Gekaufte Wünsche" });
  await userEvent.click(within(list).getByRole("button", { name: /^Exemplar anlegen: / }));
};

beforeEach(() => {
  mgr.getUser.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-WUN-05 the species is preselected from the catalog", () => {
  it("US-WUN-05 the form opens with the species of the wish and says which wish it belongs to", async () => {
    server();
    await open();
    expect(await screen.findByRole("heading", { name: "Exemplar anlegen" })).toBeTruthy();
    expect(screen.getByText(/Dracaena trifasciata/, { selector: "i, em, h2 *" })).toBeTruthy();
    expect(screen.getByText(/Wunsch „Dracaena trifasciata“/)).toBeTruthy();
  });

  it("US-WUN-05 after creating, the wish is linked to the new specimen and the page says so (P-10)", async () => {
    const f = server();
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Exemplar anlegen" }));
    await waitFor(() => expect(sent(f, "/wishes/w1/specimen")).toHaveLength(1));
    expect(JSON.parse(String(sent(f, "/wishes/w1/specimen")[0]?.[1]?.body))).toEqual({
      specimenId: "s1",
    });
    expect(await screen.findByText(LINK_HINT)).toBeTruthy();
    expect(screen.queryByText(/legst gerade/)).toBeNull();
  });

  it("US-WUN-05 a failing link says so in German and offers a retry; the specimen stays (P-10)", async () => {
    const f = server({ linkFails: true });
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Exemplar anlegen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Exemplar ist angelegt");
    expect(alert.textContent).toContain("schon mit einem anderen Exemplar verknüpft");
    expect(alert.textContent).not.toContain("roh vom Server");
    await userEvent.click(within(alert).getByRole("button", { name: "Erneut verknüpfen" }));
    await waitFor(() => expect(sent(f, "/wishes/w1/specimen")).toHaveLength(2));
    expect(sent(f, "/specimens")).toHaveLength(1);
  });

  it("US-WUN-05 'Abbrechen' drops the link: the next specimen is not linked", async () => {
    const f = server();
    await open();
    await screen.findByRole("heading", { name: "Exemplar anlegen" });
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfung abbrechen" }));
    expect(screen.queryByText(/legst gerade/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await screen.findByText(/ist angelegt/);
    expect(sent(f, "/wishes/w1/specimen")).toHaveLength(0);
  });

  it("US-WUN-05 leaving the creation drops the link, so an unrelated specimen is never linked", async () => {
    const f = server();
    await open();
    await screen.findByRole("heading", { name: "Exemplar anlegen" });
    await userEvent.click(tab("Wunschliste"));
    await screen.findByRole("list", { name: "Gekaufte Wünsche" });
    await userEvent.click(tab("Arten"));
    await screen.findByRole("heading", { name: "Art wählen" });
    await userEvent.click(await screen.findByRole("button", { name: /Dracaena trifasciata/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Diese Art wählen" }));
    await userEvent.click(await screen.findByRole("button", { name: "Exemplar anlegen" }));
    await screen.findByText(/ist angelegt/);
    expect(sent(f, "/wishes/w1/specimen")).toHaveLength(0);
  });
});

describe("US-WUN-05 a species missing in the catalog starts US-BES-01 with the name", () => {
  it("US-WUN-05 the catalog search opens with the wish name and says what to do next (P-09)", async () => {
    const f = server({ inCatalog: false });
    await open();
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
    const search = screen.getByRole("searchbox", { name: /Name/ }) as HTMLInputElement;
    expect(search.value).toBe("Dracaena trifasciata");
    expect(await screen.findByText(/noch nicht im Katalog/)).toBeTruthy();
    expect(f.mock.calls.some(([u]) => String(u).includes("/species?q=Dracaena"))).toBe(true);
    await userEvent.click(await screen.findByRole("button", { name: "Art vorschlagen" }));
    expect(
      ((await screen.findByRole("textbox", { name: /Lateinischer Name/ })) as HTMLInputElement)
        .value,
    ).toBe("Dracaena trifasciata");
  });
});
