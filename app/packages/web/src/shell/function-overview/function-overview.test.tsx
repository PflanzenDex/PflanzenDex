// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { UNLOCK_FUNCTIONS } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  navItems,
  PATHS,
} from "../../components/shared/navigation/nav-model/navigation/navigation";
import { createWrite } from "../../kernel";
import { UnlocksProvider } from "../unlock/model/unlocks/unlocks";
import { FUNCTION_EMPTY, FUNCTION_NAMES, functionAddress } from "../unlock/model/unlock-texts";
import FunctionOverview from "./function-overview";
import { FUNCTION_PURPOSES } from "./function-purposes";

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

type State = "open" | "locked";
const entry = (id: string, state: State, extra: Record<string, unknown> = {}) => ({
  id,
  state,
  announced: true,
  reasons: state === "locked" ? [{ kind: "specimens", needed: 5, have: 2 }] : [],
  ways: state === "locked" ? [{ kind: "add_specimens", missing: 3 }] : [],
  mayUnlockNow: state === "locked",
  ...extra,
});

/** What the API sends for style `many` (everything open) or `few` (a few locked); switched-off ones are missing. */
const allIds = UNLOCK_FUNCTIONS.map((f) => f.id as string);
const many = allIds.map((id) => entry(id, "open"));
const few = allIds.map((id) =>
  entry(id, ["friends", "swapping", "ai_access"].includes(id) ? "locked" : "open"),
);

function show(functions: unknown[], status = 200) {
  const posts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (init?.method === "POST") {
        posts.push(u.pathname);
        return json(200, {});
      }
      return status === 200 ? json(200, { functions }) : json(status, { error: { code: "x.y" } });
    }),
  );
  render(
    <MemoryRouter>
      <UnlocksProvider api="http://api.test" token={async () => "tok"}>
        <FunctionOverview api="http://api.test" token={async () => "tok"} />
      </UnlocksProvider>
    </MemoryRouter>,
  );
  return posts;
}

const names = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-17 the version in Was die App kann", () => {
  it("US-QS-17 · P-08 shows the app version, and unbekannt when it is not known", async () => {
    vi.stubEnv("VITE_APP_VERSION", "1.2.3");
    show(few);
    expect(await screen.findByText("Version 1.2.3")).toBeTruthy();
    cleanup();
    vi.stubEnv("VITE_APP_VERSION", "");
    show(few);
    expect(await screen.findByText("Version unbekannt")).toBeTruthy();
    vi.unstubAllEnvs();
  });
});

describe("US-ONB-06 function overview", () => {
  it("US-ONB-06 lists every function in registry order with state, purpose and a link", async () => {
    show(few);
    await screen.findByText("Freunde");
    expect(names()).toEqual(allIds.map((id) => FUNCTION_NAMES[id as keyof typeof FUNCTION_NAMES]));
    const row = screen.getByText("Tauschen").closest("li") as HTMLElement;
    expect(within(row).getByText("Freischaltbar")).toBeTruthy();
    expect(within(row).getByText(/Öffnet sich von selbst: lege noch 3 Pflanzen an/)).toBeTruthy();
    expect(within(row).getByText(FUNCTION_PURPOSES["swapping"] ?? "")).toBeTruthy();
    expect(
      within(row).getByRole("link", { name: "Tauschen: Seite ansehen" }).getAttribute("href"),
    ).toBe("/unlock/swapping");
    const open = screen.getByText("Heute").closest("li") as HTMLElement;
    expect(within(open).getByText("Aktiv")).toBeTruthy();
    expect(within(open).getByRole("link", { name: "Heute öffnen" }).getAttribute("href")).toBe(
      "/today",
    );
  });

  it("US-ONB-06 shows the same list for style many, all aktiv, and says Alles ist offen with the next step", async () => {
    show(many);
    await screen.findByText(/Alles ist offen/);
    expect(names()).toHaveLength(allIds.length);
    expect(screen.getAllByText("Aktiv")).toHaveLength(allIds.length);
    expect(screen.queryByText("Freischaltbar")).toBeNull();
    expect(screen.getByRole("link", { name: "Weiter zu Heute" }).getAttribute("href")).toBe(
      "/today",
    );
  });

  it("US-ONB-06 style few and many list the same functions in the same order", async () => {
    show(few);
    await screen.findByText("Freunde");
    const fewNames = names();
    cleanup();
    show(many);
    await screen.findByText(/Alles ist offen/);
    expect(names()).toEqual(fewNames);
  });

  it("US-ONB-06 does not list functions the operator switched off or calm mode hides", async () => {
    show(
      many.map((e) =>
        e.id === "friends"
          ? { ...e, state: "switched_off", announced: false }
          : e.id === "year_in_review"
            ? { ...e, announced: false }
            : e,
      ),
    );
    await screen.findByText(/Alles ist offen/);
    expect(names()).not.toContain("Freunde");
    expect(names()).not.toContain("Jahresrückblick");
    expect(names()).toContain("Tauschen");
  });

  it("US-ONB-06 · US-ACH-08 switching calm mode on removes the achievement functions at once, without a reload", async () => {
    let calm = false;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (init?.method === "PUT" && path === "/achievements/settings/calm-mode") {
          calm = true;
          return json(200, { calmMode: true });
        }
        return json(200, {
          functions: many.map((e) =>
            calm && ["care_rhythm", "anniversaries", "year_in_review"].includes(e.id)
              ? { ...e, announced: false }
              : e,
          ),
        });
      }),
    );
    render(
      <MemoryRouter>
        <UnlocksProvider api="http://api.test" token={async () => "tok"}>
          <FunctionOverview api="http://api.test" token={async () => "tok"} />
        </UnlocksProvider>
      </MemoryRouter>,
    );
    await screen.findByText("Jahresrückblick");
    await createWrite("http://api.test", "tok")("PUT", "/achievements/settings/calm-mode", {
      calmMode: true,
    });
    await waitFor(() => expect(names()).not.toContain("Jahresrückblick"));
    expect(names()).not.toContain("Jahrestage");
    expect(names()).not.toContain("Pflegerhythmus");
  });

  it("US-ONB-06 unlocks with one tap and says what may still be empty", async () => {
    const posts = show(few);
    const row = (await screen.findByText("Tauschen")).closest("li") as HTMLElement;
    await userEvent.click(
      within(row).getByRole("button", { name: "Tauschen: Jetzt freischalten" }),
    );
    expect(posts).toEqual(["/onboarding/unlocks/swapping"]);
    expect((await screen.findByRole("status")).textContent).toContain(
      `Tauschen ist jetzt freigeschaltet. ${FUNCTION_EMPTY.swapping}`,
    );
  });

  it("US-ONB-06 keeps a failure visible with a retry", async () => {
    show([], 500);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});

describe("US-ONB-06 registry test (FR-ONB-02, P-06)", () => {
  it("US-ONB-06 every navigation function has an entry in the overview", () => {
    const ids = new Set(UNLOCK_FUNCTIONS.map((f) => f.id as string));
    const own = new Set<string>([PATHS.account, PATHS.review, PATHS.operator]);
    const hrefs = navItems({ reviewer: true, operator: true, social: true }).map((n) => n.href);
    const functions = hrefs.filter((h) => !own.has(h));
    expect(functions.length).toBeGreaterThan(0);
    for (const href of functions) {
      const id = Object.entries(PATHS).find(([, p]) => p === href)?.[0] as string;
      expect(ids.has(id), `navigation function ${id} has no registry entry`).toBe(true);
    }
  });

  it("US-ONB-06 every registry function has a name, a purpose, an address and an empty-state text", () => {
    for (const f of UNLOCK_FUNCTIONS) {
      const id = f.id as keyof typeof FUNCTION_NAMES;
      expect(FUNCTION_NAMES[id], id).toBeTruthy();
      expect(FUNCTION_PURPOSES[id], id).toBeTruthy();
      expect(FUNCTION_EMPTY[id], id).toBeTruthy();
      expect(functionAddress(id), id).not.toBe(PATHS.start);
    }
    expect(Object.keys(FUNCTION_PURPOSES).sort()).toEqual(allIds.slice().sort());
  });
});
