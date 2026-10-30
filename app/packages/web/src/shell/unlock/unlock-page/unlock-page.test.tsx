// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { UnlockEntry } from "../model/unlock-api";
import { UnlocksProvider } from "../model/unlocks/unlocks";
import { LockedRows } from "../locked-rows/locked-rows";
import { CollapsedLockedRows } from "../locked-rows/collapsed-rows/collapsed-rows";
import { UnlockPage } from "./unlock-page";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

const open = (id: string): UnlockEntry =>
  ({
    id,
    state: "open",
    announced: true,
    reasons: [],
    ways: [],
    mayUnlockNow: false,
  }) as UnlockEntry;
const swapping = (over: Partial<UnlockEntry> = {}): UnlockEntry =>
  ({
    id: "swapping",
    state: "locked",
    announced: true,
    reasons: [{ kind: "specimens", needed: 5, have: 2 }],
    ways: [{ kind: "add_specimens", missing: 3 }],
    mayUnlockNow: true,
    ...over,
  }) as UnlockEntry;

function server(list: () => UnlockEntry[], post?: () => Promise<Response>) {
  const posts: { path: string; body: Record<string, unknown>; key: string | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (u.pathname === "/onboarding/unlocks" && (init?.method ?? "GET") === "GET")
        return response(200, { functions: list() });
      if (init?.method === "POST") {
        posts.push({
          path: u.pathname,
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          key: (init.headers as Record<string, string>)["Idempotency-Key"],
        });
        return post ? post() : response(201, {});
      }
      return response(404, {});
    }),
  );
  return posts;
}

/** The address the tests check (a stale `?sheet` is taken out of it, US-QS-18); kept out of the DOM on purpose. */
let address = "";
function Address() {
  const { pathname, search } = useLocation();
  address = `${pathname}${search}`;
  return null;
}

const page = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Address />
      <UnlocksProvider api="http://api" token={token}>
        <Routes>
          <Route path="/unlock/:id" element={<UnlockPage api="http://api" token={token} />} />
          <Route path="/" element={<LockedRows />} />
          <Route path="/collapsed" element={<CollapsedLockedRows />} />
          <Route path="/inside" element={<LockedRows only={["wishlist", "ai_access"]} />} />
        </Routes>
      </UnlocksProvider>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-05 lock page", () => {
  it("US-ONB-05 a direct link to a locked function shows reason and way and the unlock button", async () => {
    server(() => [swapping()]);
    page("/unlock/swapping");
    expect(await screen.findByRole("heading", { level: 1, name: "Tauschen" })).toBeTruthy();
    expect(screen.getByText(/Tauschen: lege noch 3 Pflanzen an\./)).toBeTruthy();
    expect(screen.getByText("Noch gesperrt")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Jetzt freischalten" })).toBeTruthy();
  });

  it("US-ONB-05 the lock page says in one sentence what the function is for and leads back to the overview", async () => {
    server(() => [swapping()]);
    page("/unlock/swapping");
    expect(
      await screen.findByText("Tausche Pflanzen und Stecklinge mit deinen Freunden."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Alle Funktionen ansehen" }).getAttribute("href")).toBe(
      "/account/functions",
    );
  });

  it("US-ONB-05 one tap unlocks with the time zone and a key, then says what may be empty and what to do next", async () => {
    let unlocked = false;
    const posts = server(
      () => [unlocked ? open("swapping") : swapping()],
      async () => {
        unlocked = true;
        return response(201, {});
      },
    );
    const user = userEvent.setup();
    page("/unlock/swapping");
    await user.click(await screen.findByRole("button", { name: "Jetzt freischalten" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Tauschen ist jetzt freigeschaltet.");
    expect(status.textContent).toContain("Du hast noch keine Freunde zum Tauschen");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.path).toBe("/onboarding/unlocks/swapping");
    expect(typeof posts[0]?.body["timeZone"]).toBe("string");
    expect(posts[0]?.key).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Tauschen öffnen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Jetzt freischalten" })).toBeNull();
    // The button is gone: the focus is on the heading, not on the body (WCAG 2.4.3).
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: "Tauschen" }),
    );
  });

  it("US-ONB-05 a refused unlock stays visible with the German text of its code (P-10)", async () => {
    server(
      () => [swapping()],
      () =>
        response(404, {
          error: { code: "onboarding.unknown_function", text: "raw server text" },
        }),
    );
    const user = userEvent.setup();
    page("/unlock/swapping");
    await user.click(await screen.findByRole("button", { name: "Jetzt freischalten" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Diese Funktion kennt die App nicht");
    expect(alert.textContent).not.toContain("raw server text");
    expect(screen.getByRole("button", { name: "Jetzt freischalten" })).toBeTruthy();
  });

  it("US-ONB-05 an open or unknown function is never a blank page: it links on", async () => {
    server(() => [open("friends")]);
    page("/unlock/friends");
    expect(await screen.findByText("Freunde ist offen.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Freunde öffnen" })).toBeTruthy();
    cleanup();
    page("/unlock/nonsense");
    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zum Start" })).toBeTruthy();
  });

  it("US-ONB-05 · A-03 an open function is a card with the button that opens it, not an underlined sentence", async () => {
    server(() => [open("friends")]);
    page("/unlock/friends");
    const opener = await screen.findByRole("link", { name: "Freunde öffnen" });
    expect(opener.className).toContain("bg-primary");
    expect(opener.className).not.toContain("underline");
    expect(screen.getByRole("link", { name: "Alle Funktionen ansehen" }).className).not.toContain(
      "underline",
    );
  });

  it("US-QS-18 · A-07 ?sheet=locked with nothing locked is taken out of the address, the page stays", async () => {
    server(() => [open("swapping")]);
    page("/collapsed?sheet=locked");
    await waitFor(() => expect(address).toBe("/collapsed"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-18 · A-07 ?sheet=locked with a locked function keeps the address and opens its layer", async () => {
    server(() => [swapping()]);
    page("/collapsed?sheet=locked");
    expect(await screen.findByRole("dialog", { name: "Weitere Funktionen" })).toBeTruthy();
    expect(address).toBe("/collapsed?sheet=locked");
  });

  it("US-ONB-05 a failed load shows the error with a retry, not an empty page (P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "input.invalid", text: "x" } }),
      ),
    );
    page("/unlock/swapping");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});

describe("US-ONB-05 locked rows", () => {
  it("US-ONB-05 locked functions stay visible as rows with the mark and the way, and link to the lock page", async () => {
    server(() => [open("pokedex"), swapping()]);
    page("/");
    const row = await screen.findByRole("link", { name: /Tauschen: lege noch 3 Pflanzen an/ });
    expect(within(row).getByText("Noch gesperrt")).toBeTruthy();
    expect(row.getAttribute("href")).toBe("/unlock/swapping");
    expect(screen.queryByText(/Pokédex/)).toBeNull();
  });

  it("US-ONB-05 calm mode: an unannounced function gets no row, not even as locked", async () => {
    server(() => [swapping({ announced: false })]);
    page("/");
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.queryByText("Noch nicht geöffnet")).toBeNull();
  });

  it("US-ONB-05 / FR-ONB-06 every account counts as many: all open means no row, no mark, no change", async () => {
    server(() => [open("friends"), open("swapping"), open("year_in_review")]);
    const { container } = page("/");
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("US-ONB-05 / FR-ONB-03 a failing lock request marks nothing as locked (the lock is no permission)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(500, {})),
    );
    const { container } = page("/");
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("US-ONB-05 inside a destination only the rows of that part show, one heading level down, same marking", async () => {
    server(() => [
      swapping(),
      swapping({ id: "wishlist" } as Partial<UnlockEntry>),
      open("ai_access"),
    ]);
    page("/inside");
    const row = await screen.findByRole("link", { name: /Wunschliste: lege noch 3 Pflanzen an/ });
    expect(within(row).getByText("Noch gesperrt")).toBeTruthy();
    expect(row.getAttribute("href")).toBe("/unlock/wishlist");
    expect(screen.getByRole("heading", { level: 3, name: "Noch nicht geöffnet" })).toBeTruthy();
    expect(screen.queryByText(/Tauschen/)).toBeNull();
    expect(screen.queryByText(/KI-Zugang/)).toBeNull();
  });
});

describe("US-QS-18 locked functions on Heute", () => {
  beforeAll(() => {
    Element.prototype.setPointerCapture ??= () => undefined;
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

  it("US-QS-18 the locked functions are one row 'n Funktionen noch nicht geöffnet' that opens a layer with the rows", async () => {
    server(() => [swapping(), swapping({ id: "wishlist" })]);
    page("/collapsed");
    const row = await screen.findByRole("button", {
      name: /^2\u00a0Funktionen noch nicht geöffnet$/,
    });
    expect(screen.queryByRole("link")).toBeNull();
    await userEvent.click(row);
    const layer = await screen.findByRole("dialog", { name: "Weitere Funktionen" });
    expect(within(layer).getAllByRole("link")).toHaveLength(2);
  });

  it("US-QS-18 nothing locked shows no row", async () => {
    server(() => [open("swapping")]);
    page("/collapsed");
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button")).toBeNull();
  });
});
