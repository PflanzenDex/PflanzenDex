// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FriendOffers } from "./friend-offers";
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import { filledIn, hasOwnBorder, isFilled, isPlain, isTinted } from "@/shared/ui/button.roles";
import table from "../../swap.de.json";
import { FriendOffersSkeleton } from "./friend-offers.skeleton";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const offer = (extra: Record<string, unknown> = {}) => ({
  ownerName: "Ben",
  offerId: "o1",
  specimenId: "s9",
  type: "cutting",
  mode: "swap",
  wish: "Ein Ableger",
  note: "Gut bewurzelt",
  offeredAt: "2026-10-08T10:00:00.000Z",
  photosShared: false,
  specimenName: "Aloe Ableger",
  speciesLatin: "Aloe vera",
  speciesGerman: "Echte Aloe",
  health: { treatmentOpen: false, lastTreated: { reason: "Wollläuse", doneAt: "2026-09-10" } },
  phase: "dormancy",
  lack: true,
  onWishlist: true,
  requested: false,
  ...extra,
});

function server(opts: { offers?: unknown[]; post?: () => Promise<Response> } = {}) {
  const state = { offers: opts.offers ?? [offer()] };
  const gets: string[] = [];
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (init?.method === "POST") {
        posts.push({ path: u.pathname, body: JSON.parse(String(init.body)) });
        if (opts.post) return opts.post();
        state.offers = state.offers.map((o) => ({ ...(o as object), requested: true }));
        return response(201, { swapId: "sw1" });
      }
      if (u.pathname === "/exchange/offers") {
        gets.push(u.search);
        return response(200, { offers: state.offers });
      }
      if (u.pathname === "/specimens")
        return response(200, {
          specimens: [
            { id: "m1", name: "Mein Haworthia", status: "plant" },
            { id: "m2", name: "Privat", status: "plant" },
            { id: "m3", name: "Alt", status: "archived" },
          ],
        });
      if (u.pathname === "/sharing")
        return response(200, { shared: [{ specimenId: "m1" }, { specimenId: "m3" }] });
      return response(404, {});
    }),
  );
  return { gets, posts };
}
const show = () =>
  render(
    <MemoryRouter>
      <FriendOffers api="http://api" token={token} />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-SOZ-09 offers of friends in the exchange", () => {
  it("lists species, giver, type, mode, health, phase, the chip 'you lack it' and the wishlist hint", async () => {
    server();
    show();
    const list = await screen.findByRole("list", { name: "Angebote von Freunden" });
    const text = within(list).getByRole("listitem").textContent ?? "";
    expect(text).toContain("Echte Aloe");
    expect(text).toContain("Aloe vera");
    expect(text).toContain("Ben");
    expect(text).toContain("Steckling · Tauschen");
    expect(text).toContain("Zuletzt behandelt: Wollläuse, 10.09.2026");
    expect(text).toContain("Zurzeit in der Ruhephase.");
    expect(text).toContain("Fehlt dir");
    expect(text).toContain("Steht auf deiner Wunschliste");
    expect(text).toContain("Wunsch: Ein Ableger");
  });

  it("an unknown species is called unknown, not 'lacking' (P-08)", async () => {
    server({
      offers: [offer({ speciesLatin: null, speciesGerman: null, lack: null, onWishlist: false })],
    });
    show();
    const item = (await screen.findAllByRole("listitem"))[0] as HTMLElement;
    expect(item.textContent).toContain("Art unbekannt");
    expect(item.textContent).not.toContain("Fehlt dir");
  });

  it("without offers it says what to do next (P-09)", async () => {
    server({ offers: [] });
    show();
    expect(await screen.findByText(/Deine Freunde bieten gerade nichts an\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Freund hinzufügen" }).getAttribute("href")).toBe(
      "/friends?sheet=add",
    );
  });

  it("the filters ask the server: type and 'you lack it'", async () => {
    const { gets } = server();
    show();
    await screen.findByRole("list", { name: "Angebote von Freunden" });
    await userEvent.selectOptions(screen.getByLabelText("Angebotsform"), "plant");
    await vi.waitFor(() => expect(gets.at(-1)).toContain("type=plant"));
    await userEvent.click(screen.getByLabelText("Nur was dir fehlt"));
    await vi.waitFor(() => expect(gets.at(-1)).toContain("lack=true"));
  });

  it("US-QS-32 requesting with free text sends one request, confirms it and marks the offer as requested; the button reads Pflanze anfragen", async () => {
    const { posts } = server();
    show();
    const request = await screen.findByRole("button", { name: "Pflanze anfragen: Echte Aloe" });
    expect(request.textContent).toBe("Pflanze anfragen");
    await userEvent.click(request);
    await userEvent.type(screen.getByLabelText(/Was bietest du an/), "Einen Haworthia-Ableger");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText(/Deine Anfrage für Echte Aloe ist gesendet/)).toBeTruthy();
    expect(posts).toEqual([
      { path: "/offers/o1/request", body: { counterText: "Einen Haworthia-Ableger" } },
    ]);
    await vi.waitFor(() => expect(screen.getByText("Angefragt")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Pflanze anfragen: Echte Aloe/ })).toBeNull();
  });

  it("US-QS-32 · SG-BASE-01 issue 2468 · after a sent request the focus is on the 'Angefragt' badge of that offer, not on the body", async () => {
    const { posts } = server({
      offers: [offer(), offer({ offerId: "o2", specimenName: "Zweite" })],
    });
    show();
    await userEvent.click(
      (
        await screen.findAllByRole("button", { name: /^Pflanze anfragen: Echte Aloe$/ })
      )[0] as HTMLElement,
    );
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    await vi.waitFor(() => expect(screen.getAllByText("Angefragt").length).toBeGreaterThan(0));
    const badge = screen.getAllByText("Angefragt")[0] as HTMLElement;
    await vi.waitFor(() => expect(document.activeElement).toBe(badge));
    expect(document.activeElement).not.toBe(document.body);
    expect(badge.getAttribute("tabindex")).toBe("-1");
    expect(posts).toHaveLength(1);
  });

  it("US-QS-32 · SG-BASE-01 issue 2468 · 'Abbrechen' closes the request and returns the focus to the 'Pflanze anfragen' button that opened it", async () => {
    server();
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Pflanze anfragen: Echte Aloe" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    const again = await screen.findByRole("button", { name: "Pflanze anfragen: Echte Aloe" });
    expect(document.activeElement).toBe(again);
  });

  it("the counter-offer lists only my active specimens that I share, and is sent by id", async () => {
    const { posts } = server();
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Pflanze anfragen: Echte Aloe" }),
    );
    const select = screen.getByLabelText("Eigene Pflanze als Gegenangebot");
    const names = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual(["Offen lassen", "Mein Haworthia"]);
    await userEvent.selectOptions(select, "m1");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    await screen.findByText(/ist gesendet/);
    expect(posts[0]?.body).toEqual({ counterSpecimenId: "m1" });
  });

  it("a gift has no counter-offer fields, only the request", async () => {
    server({ offers: [offer({ mode: "give_away" })] });
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Pflanze anfragen: Echte Aloe" }),
    );
    expect(screen.queryByLabelText("Eigene Pflanze als Gegenangebot")).toBeNull();
    expect(screen.queryByLabelText(/Was bietest du an/)).toBeNull();
    expect(screen.getByRole("button", { name: "Anfrage senden" })).toBeTruthy();
  });

  it("a refusal shows the German text of its code and keeps the form (P-10)", async () => {
    server({
      post: () =>
        response(409, { error: { code: "swap.already_requested", text: "raw server text" } }),
    });
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Pflanze anfragen: Echte Aloe" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Du hast dieses Angebot schon angefragt");
    expect(alert.textContent).not.toContain("raw server text");
    expect(screen.getByRole("button", { name: "Anfrage senden" })).toBeTruthy();
  });

  it("US-QS-03 · P-10 a key conflict of a request offers 'Hinweis schließen', which clears the notice and frees the key for the next request", async () => {
    const { posts } = server({
      post: () =>
        response(409, { error: { code: "idempotency.key_conflict", text: "raw server text" } }),
    });
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Pflanze anfragen: Echte Aloe" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Deine erste Eingabe ist gesichert.");
    await userEvent.click(within(alert).getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    await screen.findByRole("alert");
    expect(posts).toHaveLength(2);
    const keys = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === "POST")
      .map(([, init]) => (init?.headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("US-QS-03 · P-10 any other refusal of a request has no 'Hinweis schließen'", async () => {
    server({
      post: () =>
        response(409, { error: { code: "swap.already_requested", text: "raw server text" } }),
    });
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Pflanze anfragen: Echte Aloe" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Hinweis schließen" })).toBeNull();
  });

  it("US-QS-32 · SG-BASE-01 while a request is sent 'Anfrage senden' is aria-disabled, not disabled: it keeps the focus and a second tap sends nothing (issue 2464, F-0094)", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const { posts } = server({
      post: async () => {
        await gate;
        return response(409, { error: { code: "swap.already_requested", text: "raw" } });
      },
    });
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Pflanze anfragen: Echte Aloe" }),
    );
    const send = screen.getByRole("button", { name: "Anfrage senden" });
    await userEvent.click(send);
    await vi.waitFor(() => expect(send.getAttribute("aria-disabled")).toBe("true"));
    expect(send.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(send);
    await userEvent.click(send);
    release();
    await screen.findByRole("alert");
    expect(posts).toHaveLength(1);
    expect(send.hasAttribute("aria-disabled")).toBe(false);
    expect(document.activeElement).toBe(send);
  });

  it("an offer I requested already shows 'Angefragt' and no request button", async () => {
    server({ offers: [offer({ requested: true })] });
    show();
    expect(await screen.findByText("Angefragt")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pflanze anfragen:/ })).toBeNull();
  });
});

describe("US-QS-32 · SG-BTN-01 the offers of friends have no outline button", () => {
  it("US-QS-32 · SG-BTN-02 an offer's one button 'Pflanze anfragen' is tinted, and no button of the list is filled", async () => {
    server({ offers: [offer(), offer({ offerId: "o2", specimenName: "Zweite" })] });
    show();
    const list = await screen.findByRole("list", { name: "Angebote von Freunden" });
    const requests = within(list).getAllByRole("button", { name: /^Pflanze anfragen: / });
    expect(requests).toHaveLength(2);
    for (const b of requests) {
      expect(isTinted(b)).toBe(true);
      expect(hasOwnBorder(b)).toBe(false);
    }
    expect(filledIn(list)).toEqual([]);
  });

  it("US-QS-32 · SG-BTN-01 the open request has a filled 'Anfrage senden' and a plain 'Abbrechen'", async () => {
    server();
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Pflanze anfragen: Echte Aloe" }),
    );
    const send = screen.getByRole("button", { name: "Anfrage senden" });
    const cancel = screen.getByRole("button", { name: "Abbrechen" });
    expect(isFilled(send)).toBe(true);
    expect(isPlain(cancel)).toBe(true);
    expect(hasOwnBorder(cancel)).toBe(false);
  });
});

describe("US-QS-14 issue 1697 · the offers of friends show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(
      <FriendOffersSkeleton label={table["friends.loading"]} />,
      table["friends.loading"],
    ));
});
