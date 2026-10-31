// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { UNLOCK_FUNCTIONS } from "@pflanzendex/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  navItems,
  PATHS,
} from "../../components/shared/navigation/nav-model/navigation/navigation";
import { createWrite } from "../../kernel";
import { setViewportWidth } from "@/lib/viewport-mock";
import { UnlocksProvider } from "../unlock/model/unlocks/unlocks";
import { FUNCTION_EMPTY, FUNCTION_NAMES, functionAddress } from "../unlock/model/unlock-texts";
import FunctionOverview from "./function-overview";
import { FUNCTION_PURPOSES } from "./function-purposes";

// A phone (US-QS-15): the list is in pages of four and each function opens as a layer.
beforeAll(() => setViewportWidth(390));

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

/** The rows of the list over all pages, in order: name and state word; the list is back on its first page after. */
async function rows(): Promise<{ name: string; state: string }[]> {
  const out: { name: string; state: string }[] = [];
  const list = () => screen.findByRole("list", { name: "Funktionen" });
  for (;;) {
    for (const b of within(await list()).getAllByRole("button")) {
      out.push({
        name: b.querySelector(".font-semibold")?.textContent ?? "",
        state: b.querySelector(".text-muted-foreground")?.textContent ?? "",
      });
    }
    const next = screen.getByRole("button", { name: "Weiter" }) as HTMLButtonElement;
    if (next.disabled) break;
    await userEvent.click(next);
  }
  for (;;) {
    const prev = screen.getByRole("button", { name: "Zurück" }) as HTMLButtonElement;
    if (prev.disabled) return out;
    await userEvent.click(prev);
  }
}

/** Opens the layer of one function: the list is searched from its first page, the row is chosen by its name. */
async function openFunction(name: string) {
  for (;;) {
    const list = await screen.findByRole("list", { name: "Funktionen" });
    const row = within(list)
      .queryAllByRole("button")
      .find((b) => b.querySelector(".font-semibold")?.textContent === name);
    if (row) {
      await userEvent.click(row);
      return;
    }
    const next = screen.getByRole("button", { name: "Weiter" }) as HTMLButtonElement;
    if (next.disabled) throw new Error(`no row ${name}`);
    await userEvent.click(next);
  }
}

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
  it("US-ONB-06 lists every function in registry order with its state; its layer has purpose, way and link", async () => {
    show(few);
    const list = await rows();
    expect(list.map((r) => r.name)).toEqual(
      allIds.map((id) => FUNCTION_NAMES[id as keyof typeof FUNCTION_NAMES]),
    );
    expect(list.find((r) => r.name === "Tauschen")?.state).toBe("Freischaltbar");
    expect(list.find((r) => r.name === "Heute")?.state).toBe("Aktiv");
    await openFunction("Tauschen");
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Öffnet sich von selbst: lege noch 3 Pflanzen an/),
    ).toBeTruthy();
    expect(within(dialog).getByText(FUNCTION_PURPOSES["swapping"] ?? "")).toBeTruthy();
    expect(
      within(dialog).getByRole("link", { name: "Tauschen: Seite ansehen" }).getAttribute("href"),
    ).toBe("/unlock/swapping");
  });

  it("US-ONB-06 shows the same list for style many, all aktiv, and says Alles ist offen with the next step", async () => {
    show(many);
    await screen.findByText(/Alles ist offen/);
    const list = await rows();
    expect(list).toHaveLength(allIds.length);
    expect(list.every((r) => r.state === "Aktiv")).toBe(true);
    expect(screen.getByRole("link", { name: "Weiter zu Heute" }).getAttribute("href")).toBe(
      "/today",
    );
  });

  it("US-ONB-06 style few and many list the same functions in the same order", async () => {
    show(few);
    const fewNames = (await rows()).map((r) => r.name);
    cleanup();
    show(many);
    await screen.findByText(/Alles ist offen/);
    expect((await rows()).map((r) => r.name)).toEqual(fewNames);
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
    const names = (await rows()).map((r) => r.name);
    expect(names).not.toContain("Freunde");
    expect(names).not.toContain("Jahresrückblick");
    expect(names).toContain("Tauschen");
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
    expect((await rows()).map((r) => r.name)).toContain("Jahresrückblick");
    await createWrite("http://api.test", "tok")("PUT", "/achievements/settings/calm-mode", {
      calmMode: true,
    });
    await vi.waitFor(async () =>
      expect((await rows()).map((r) => r.name)).not.toContain("Jahresrückblick"),
    );
    const names = (await rows()).map((r) => r.name);
    expect(names).not.toContain("Jahrestage");
    expect(names).not.toContain("Pflegerhythmus");
  });

  it("US-ONB-06 unlocks with one tap in its layer and says what may still be empty", async () => {
    const posts = show(few);
    await openFunction("Tauschen");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Tauschen: Jetzt freischalten" }),
    );
    expect(posts).toEqual(["/onboarding/unlocks/swapping"]);
    expect(
      await screen.findByText(`Tauschen ist jetzt freigeschaltet. ${FUNCTION_EMPTY.swapping}`),
    ).toBeTruthy();
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
      if (id !== "today") expect(functionAddress(id), id).not.toBe(PATHS.today);
    }
    expect(Object.keys(FUNCTION_PURPOSES).sort()).toEqual(allIds.slice().sort());
  });
});
