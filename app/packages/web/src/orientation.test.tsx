// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppShell } from "./components/shared/app-shell";
import { AppRoutes } from "./routes";
import { navItems, PATHS, viewTitle } from "./navigation";

beforeAll(() => {
  // jsdom has no matchMedia, the bottom bar's drawer reads it.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.title = "";
});

const failing = { error: { code: "server.error", text: "Der Server antwortet nicht." } };
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const everyone = { reviewer: true, operator: true };

/** The signed-in app as `App` wires it, around the real routes. Every request fails: orientation must not depend on data. */
function renderAt(path: string, answer: (url: string) => unknown = () => undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = answer(new URL(String(url)).pathname);
      return body === undefined ? response(500, failing) : response(200, body);
    }),
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell items={navItems(everyone)} titleOf={viewTitle}>
        <AppRoutes
          api="http://api.test"
          session={{ token: async () => "tok" } as never}
          account={{ id: "1", displayName: "Lena", email: "l@example.test", ...everyone } as never}
          onOpen={() => undefined}
          onOpenProfile={() => undefined}
          handOver={{
            newSpecies: null,
            setNewSpecies: () => undefined,
            choose: () => undefined,
            toTheCatalog: () => undefined,
            onCreated: () => undefined,
            startFromWish: () => undefined,
          }}
        />
      </AppShell>
    </MemoryRouter>,
  );
}

const VIEWS = Object.entries(PATHS);

describe("US-QS-09 · every view has a unique German title (2.4.2)", () => {
  it("US-QS-09 each address has its own title ending in the product name", () => {
    const titles = [...VIEWS.map(([, path]) => viewTitle(path)), viewTitle("/species/abc")];
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of titles) expect(t).toMatch(/^.+ – PflanzenDex$/);
    expect(viewTitle(PATHS.start)).toBe("Start – PflanzenDex");
    expect(viewTitle("/gibt-es-nicht")).toBe("PflanzenDex");
  });

  it.each(VIEWS)("US-QS-09 the view %s sets its title in the document", (_view, path) => {
    renderAt(path);
    expect(document.title).toBe(viewTitle(path));
  });
});

describe("US-QS-09 · every view has one main heading and the regions (1.3.1, 2.4.6)", () => {
  it.each(VIEWS)(
    "US-QS-09 the view %s has exactly one h1 in main, plus header and navigation",
    async (_view, path) => {
      renderAt(path);
      const main = screen.getByRole("main");
      await waitFor(() => expect(within(main).queryByRole("status")).toBeNull(), {
        timeout: 4000,
      });
      expect(within(main).getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("banner")).toBeTruthy();
      expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
      expect(screen.getAllByRole("main")).toHaveLength(1);
    },
  );
});

describe("US-QS-09 · the navigation is the same in every view (3.2.3, 3.2.4)", () => {
  it("US-QS-09 entries keep their order and names on every view", async () => {
    const seen: string[][] = [];
    for (const [, path] of VIEWS) {
      renderAt(path);
      const bar = screen.getByRole("navigation", { name: "Hauptnavigation" });
      seen.push(
        within(bar)
          .getAllByRole("link")
          // The product name on top of the sidebar is a brand link home, not a destination (US-QS-14).
          .filter((a) => a.textContent !== "PflanzenDex")
          .map((a) => `${a.textContent}|${a.getAttribute("href")}`),
      );
      cleanup();
    }
    for (const links of seen) expect(links).toEqual(seen[0]);
    // "/" (Start) is no destination: the brand link leads there (US-QS-14).
    expect(seen[0]?.length).toBe(Object.keys(PATHS).length - 1);
  }, 20_000); // renders every view in one test: ~1 s alone, over the 5 s default under machine load (#200)

  it("US-QS-09 keyboard only: choosing an entry moves the focus to the heading of the new view", async () => {
    renderAt(PATHS.start);
    const bar = screen.getByRole("navigation", { name: "Hauptnavigation" });
    const link = within(bar).getByRole("link", { name: "Wunschliste" });
    link.focus();
    await userEvent.keyboard("{Enter}");
    const heading = await screen.findByRole("heading", { level: 1, name: /Wunschliste/ });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.title).toBe("Wunschliste – PflanzenDex");
  });
});

describe("US-QS-09 · a view with nothing to do says so and names the next step (P-09)", () => {
  const empty = (path: string) =>
    ({
      "/hints": { hints: [] },
      "/specimens/hints": { hints: [] },
      "/locations": { locations: [] },
      "/specimens/difficulty": { rows: [] },
    })[path];

  it("US-QS-09 the empty hints say so in text with a button to the next place, after the one heading", async () => {
    renderAt(PATHS.hints, empty);
    const note = await screen.findByRole("heading", { level: 2, name: "Keine Hinweise" });
    const main = screen.getByRole("main");
    expect(main.contains(note)).toBe(true);
    const h1 = within(main).getByRole("heading", { level: 1 });
    expect(h1.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(main).getByRole("button", { name: "Zum Bestand" })).toBeTruthy();
  });

  it("US-QS-09 the empty species comparison names what to do in its text", async () => {
    renderAt(PATHS.difficulty, empty);
    await screen.findByRole("heading", { name: "Noch keine Art mit aktivem Exemplar" });
    expect(screen.getByText(/Lege im Bestand ein Exemplar an/)).toBeTruthy();
  });

  it("US-QS-09 a view that failed to load shows its heading, the reason and a retry, not a blank page", async () => {
    renderAt(PATHS.difficulty);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Artenvergleich" })).toBeTruthy();
  });
});
