// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UnlockEntry } from "../model/unlock-api";
import { UnlocksProvider } from "../model/unlocks/unlocks";
import { LockedRows } from "../locked-rows/locked-rows";
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

const page = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <UnlocksProvider api="http://api" token={token}>
        <Routes>
          <Route path="/unlock/:id" element={<UnlockPage api="http://api" token={token} />} />
          <Route path="/" element={<LockedRows />} />
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
