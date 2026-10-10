// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwapRequests } from "./swap-requests";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const side = (extra: Record<string, unknown> = {}) => ({
  swapId: "s1",
  role: "giver",
  otherId: "ben",
  otherName: "Ben",
  offerId: "o1",
  speciesLatin: "Aloe vera",
  speciesGerman: "Echte Aloe",
  type: "cutting",
  mode: "swap",
  counterName: "Mein Haworthia",
  counterText: null,
  status: "requested",
  requestedAt: "2026-10-09T10:00:00.000Z",
  reason: null,
  cause: null,
  proposal: false,
  decidedAt: null,
  ...extra,
});

function server(
  overview: { received?: unknown[]; sent?: unknown[] },
  post?: () => Promise<Response>,
) {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (init?.method === "POST") {
        posts.push({ path: u.pathname, body: JSON.parse(String(init.body)) });
        return post ? post() : response(200, { status: "accepted" });
      }
      if (u.pathname === "/swaps") return response(200, { received: [], sent: [], ...overview });
      return response(404, {});
    }),
  );
  return posts;
}
const show = () => render(<SwapRequests api="http://api" token={token} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-SOZ-10 requests for my offers", () => {
  it("lists a request with the requester, species, counter-offer and the actions", async () => {
    server({ received: [side()] });
    show();
    const list = await screen.findByRole("list", { name: "Anfragen an dich" });
    const text = within(list).getByRole("listitem").textContent ?? "";
    expect(text).toContain("Echte Aloe");
    expect(text).toContain("Ben");
    expect(text).toContain("Gegenangebot: Mein Haworthia");
    expect(text).toContain("Angefragt");
    expect(screen.getByRole("button", { name: "Annehmen: Echte Aloe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ablehnen: Echte Aloe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anderes vorschlagen: Echte Aloe" })).toBeTruthy();
  });

  it("accepting sends the action and says what happened and what comes next (P-09)", async () => {
    const posts = server({ received: [side()] });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Annehmen: Echte Aloe" }));
    expect(
      await screen.findByText(/Du hast die Anfrage von Ben für Echte Aloe angenommen/),
    ).toBeTruthy();
    expect(posts).toEqual([{ path: "/swaps/s1/answer", body: { action: "accept" } }]);
  });

  it("declining asks for an optional reason and sends it", async () => {
    const posts = server({ received: [side()] });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Ablehnen: Echte Aloe" }));
    await userEvent.type(screen.getByLabelText(/Grund \(optional\)/), "Zu klein");
    await userEvent.click(screen.getByRole("button", { name: "Ablehnung senden" }));
    await screen.findByText(/abgelehnt/);
    expect(posts[0]?.body).toEqual({ action: "decline", reason: "Zu klein" });
  });

  it("proposing something else needs the text", async () => {
    const posts = server({ received: [side()] });
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Anderes vorschlagen: Echte Aloe" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Vorschlag senden" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Schreibe, was du statt dessen möchtest",
    );
    expect(posts).toEqual([]);
    await userEvent.type(
      screen.getByLabelText("Was möchtest du statt dessen?"),
      "Lieber eine Aloe",
    );
    await userEvent.click(screen.getByRole("button", { name: "Vorschlag senden" }));
    await screen.findByText(/Vorschlag/);
    expect(posts[0]?.body).toEqual({ action: "propose", proposal: "Lieber eine Aloe" });
  });

  it("an accepted request can be canceled again; a finished one has no actions and says why (P-10)", async () => {
    const posts = server({
      received: [
        side({ swapId: "a", status: "accepted" }),
        side({ swapId: "b", status: "declined", cause: "already_given", otherName: "Cleo" }),
        side({ swapId: "c", status: "canceled", cause: "friendship_ended", otherName: "Dora" }),
        side({ swapId: "d", status: "declined", reason: "Zu klein", otherName: "Emil" }),
      ],
    });
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Zusage zurückziehen: Echte Aloe" }),
    );
    await screen.findByText(/Die Zusage ist zurückgezogen/);
    expect(posts[0]).toEqual({ path: "/swaps/a/answer", body: { action: "cancel" } });
    const text = (await screen.findByRole("list", { name: "Anfragen an dich" })).textContent ?? "";
    expect(text).toContain("Schon vergeben");
    expect(text).toContain("Ihr seid nicht mehr befreundet");
    expect(text).toContain("Grund: Zu klein");
  });

  it("a refusal shows the German text of its code (P-10)", async () => {
    server({ received: [side()] }, () =>
      response(409, { error: { code: "swap.wrong_state", text: "raw server text" } }),
    );
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Annehmen: Echte Aloe" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Die Anfrage ist schon beantwortet");
    expect(alert.textContent).not.toContain("raw server text");
  });
});

describe("US-SOZ-10 requests I sent", () => {
  it("shows the state, the giver's proposal and the reason of a decline; waiting requests can be withdrawn", async () => {
    const posts = server({
      sent: [
        side({
          swapId: "x",
          role: "recipient",
          otherName: "Anna",
          proposal: true,
          counterName: null,
          counterText: "Lieber eine Aloe",
        }),
        side({
          swapId: "y",
          role: "recipient",
          otherName: "Anna",
          status: "declined",
          reason: "Zu klein",
          speciesGerman: "Haworthie",
        }),
      ],
    });
    show();
    const list = await screen.findByRole("list", { name: "Deine Anfragen" });
    const text = list.textContent ?? "";
    expect(text).toContain("Vorschlag von Anna: Lieber eine Aloe");
    expect(text).toContain("Abgelehnt");
    expect(text).toContain("Grund: Zu klein");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage zurückziehen: Echte Aloe" }));
    await screen.findByText(/Deine Anfrage ist zurückgezogen/);
    expect(posts[0]).toEqual({ path: "/swaps/x/answer", body: { action: "withdraw" } });
    expect(screen.queryByRole("button", { name: /zurückziehen: Haworthie/ })).toBeNull();
  });

  it("without any swap the section says what to do next (P-09)", async () => {
    server({});
    show();
    expect(await screen.findByText(/Noch keine Anfragen/)).toBeTruthy();
  });
});
