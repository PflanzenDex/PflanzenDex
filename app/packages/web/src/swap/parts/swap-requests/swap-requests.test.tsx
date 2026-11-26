// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwapRequests } from "./swap-requests";
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import table from "../../swap.de.json";
import { SwapRequestsSkeleton } from "./swap-requests.skeleton";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const side = (extra: Record<string, unknown> = {}) => ({
  swapId: "s1",
  role: "giver",
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
  confirmedGiver: false,
  confirmedRecipient: false,
  specimenName: null,
  givenSpecimenId: null,
  receivedSpecimenId: null,
  handedOverAt: null,
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
const show = () =>
  render(
    <MemoryRouter>
      <SwapRequests api="http://api" token={token} />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-SOZ-10 requests for my offers", () => {
  it("lists a request with the requester, species, counter-offer and the actions", async () => {
    server({ received: [side()] });
    show();
    const list = await screen.findByRole("list", { name: "Anfragen" });
    const text = within(list).getByRole("listitem").textContent ?? "";
    expect(text).toContain("Echte Aloe");
    expect(text).toContain("Ben");
    expect(text).toContain("Gegenangebot: Mein Haworthia");
    expect(text).toContain("Angefragt");
    expect(screen.getByRole("button", { name: "Annehmen: Echte Aloe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ablehnen: Echte Aloe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anderes vorschlagen: Echte Aloe" })).toBeTruthy();
  });

  it("US-QS-32 · SG-BTN-02 the Anfragen part has one filled button for a received request: Annehmen; Ablehnen and Anderes vorschlagen are plain", async () => {
    server({ received: [side()] });
    show();
    await screen.findByRole("list", { name: "Anfragen" });
    const filled = screen
      .getAllByRole("button")
      .filter((b) => b.className.split(/\s+/).includes("bg-primary"));
    expect(filled.map((b) => b.textContent)).toEqual(["Annehmen"]);
    for (const name of ["Ablehnen: Echte Aloe", "Anderes vorschlagen: Echte Aloe"]) {
      const classes = screen.getByRole("button", { name }).className.split(/\s+/);
      expect(classes).toContain("text-primary");
      expect(classes.some((c) => /^(border|bg)(-|$)/.test(c))).toBe(false);
    }
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
    const list = () => screen.findByRole("list", { name: "Anfragen" });
    expect((await list()).textContent ?? "").toContain("Schon vergeben");
    // The third and fourth request are in the same list on a phone (US-QS-32).
    const rest = (await list()).textContent ?? "";
    expect(rest).toContain("Ihr seid nicht mehr befreundet");
    expect(rest).toContain("Grund: Zu klein");
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

  it("US-QS-03 · P-10 a key conflict of an answer offers 'Hinweis schließen', which clears the notice and returns the focus to the button", async () => {
    server({ received: [side()] }, () =>
      response(409, { error: { code: "idempotency.key_conflict", text: "raw server text" } }),
    );
    show();
    const accept = await screen.findByRole("button", { name: "Annehmen: Echte Aloe" });
    await userEvent.click(accept);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Deine erste Eingabe ist gesichert.");
    await userEvent.click(within(alert).getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(accept);
  });

  it("US-QS-03 · P-10 any other refusal of an answer has no 'Hinweis schließen'", async () => {
    server({ received: [side()] }, () =>
      response(409, { error: { code: "swap.wrong_state", text: "raw server text" } }),
    );
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Annehmen: Echte Aloe" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Hinweis schließen" })).toBeNull();
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
    const list = await screen.findByRole("list", { name: "Anfragen" });
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
    expect(await screen.findByText(/Noch keine Anfrage\./)).toBeTruthy();
  });
});

describe("US-SOZ-11 confirming the handover", () => {
  const accepted = (extra: Record<string, unknown> = {}) => side({ status: "accepted", ...extra });

  it("an accepted swap offers 'confirm handover' to the giver and sends it with the time zone", async () => {
    const posts = server({ received: [accepted()] }, () => response(200, { status: "waiting" }));
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Übergabe bestätigen: Echte Aloe" }),
    );
    expect(await screen.findByText(/Deine Bestätigung ist gesichert/)).toBeTruthy();
    expect(posts[0]?.path).toBe("/swaps/s1/handover");
    expect(posts[0]?.body).toMatchObject({ timeZone: expect.any(String) });
    expect(posts[0]?.body["marker"]).toBeUndefined();
  });

  it("after my confirmation the card says I am waiting for the other side and the button is gone (P-09)", async () => {
    server({ received: [accepted({ confirmedGiver: true })] });
    show();
    const item = (await screen.findAllByRole("listitem"))[0] as HTMLElement;
    expect(item.textContent).toContain(
      "Deine Bestätigung ist gesichert. Sobald Ben auch bestätigt hat, wird übergeben.",
    );
    expect(screen.queryByRole("button", { name: /Übergabe bestätigen/ })).toBeNull();
  });

  it("the recipient confirms the receipt, optionally with a marker, and is told where the specimen is now", async () => {
    const posts = server({ sent: [accepted({ role: "recipient", otherName: "Anna" })] }, () =>
      response(200, { status: "handed_over", receivedSpecimenId: "r1" }),
    );
    show();
    await userEvent.type(await screen.findByLabelText(/Kennzeichen/), "rot");
    await userEvent.click(screen.getByRole("button", { name: "Erhalt bestätigen: Echte Aloe" }));
    expect(await screen.findByText(/Die Übergabe ist abgeschlossen/)).toBeTruthy();
    expect(posts[0]?.body).toMatchObject({ marker: "rot" });
  });

  it("US-QS-32 US-SOZ-11 the giver of a plant is told the handover is done in one line; the archive fact is on the refreshed card, once", async () => {
    const data = { received: [accepted({ type: "plant", specimenName: "Probe Pflanze A" })] };
    server(data, async () => {
      data.received = [
        side({
          status: "handed_over",
          type: "plant",
          specimenName: "Probe Pflanze A",
          specimenArchived: true,
          givenSpecimenId: "g1",
          handedOverAt: "2026-10-10T10:00:00.000Z",
        }),
      ];
      return response(200, { status: "handed_over" });
    });
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Übergabe bestätigen: Echte Aloe" }),
    );
    expect(await screen.findByText("Die Übergabe ist abgeschlossen.")).toBeTruthy();
    expect(await screen.findByText("„Probe Pflanze A“ ist im Archiv.")).toBeTruthy();
    expect(screen.queryByText(/Die Übergabe ist abgeschlossen\. „/)).toBeNull();
    expect(screen.getAllByText(/im Archiv\./)).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Im Archiv ansehen" })).toHaveLength(1);
  });

  it("US-QS-32 the recipient's marker field names his new plant without a typo", async () => {
    server({ sent: [accepted({ role: "recipient" })] });
    show();
    expect(
      await screen.findByLabelText(
        "Kennzeichen für deine neue Pflanze (nur nötig, wenn du die Art schon hast)",
      ),
    ).toBeTruthy();
  });

  it("a refusal (marker needed) shows the German text of its code and keeps the form (P-10)", async () => {
    server({ sent: [accepted({ role: "recipient" })] }, () =>
      response(409, { error: { code: "specimen.marker_required", text: "raw server text" } }),
    );
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Erhalt bestätigen: Echte Aloe" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("raw server text");
    expect(alert.textContent?.length).toBeGreaterThan(10);
    expect(screen.getByLabelText(/Kennzeichen/)).toBeTruthy();
  });

  it("a requested or finished swap has no handover button", async () => {
    server({ received: [side({ swapId: "a" }), side({ swapId: "b", status: "handed_over" })] });
    show();
    await screen.findAllByRole("listitem");
    expect(
      screen.queryByRole("button", { name: /Übergabe bestätigen|Erhalt bestätigen/ }),
    ).toBeNull();
  });
});

describe("US-SOZ-11 the giver's plant goes into the archive; a cutting or offshoot stays in the collection (Q-149, Q-85)", () => {
  const accepted = (extra: Record<string, unknown> = {}) => side({ status: "accepted", ...extra });
  const ARCHIVE_HREF = "/collection?view=plants&sheet=archive";

  it("before the giver confirms a plant handover the card says the plant goes into the archive once the friend confirmed", async () => {
    server({ received: [accepted({ type: "plant", specimenName: "Probe Pflanze A" })] });
    show();
    expect(
      await screen.findByText("„Probe Pflanze A“ geht ins Archiv, sobald Ben bestätigt."),
    ).toBeTruthy();
  });

  it("US-SOZ-11 the friend confirmed first: the card says the plant goes into the archive with this confirmation, not once the friend confirms", async () => {
    server({
      received: [
        accepted({ type: "plant", specimenName: "Probe Pflanze A", confirmedRecipient: true }),
      ],
    });
    show();
    expect(
      await screen.findByText("„Probe Pflanze A“ geht mit deiner Bestätigung ins Archiv."),
    ).toBeTruthy();
    expect(screen.queryByText(/sobald Ben bestätigt/)).toBeNull();
  });

  it("US-SOZ-11 the friend confirmed first and no name: the sentence still says it goes into the archive with this confirmation (P-08)", async () => {
    server({
      received: [accepted({ type: "plant", specimenName: null, confirmedRecipient: true })],
    });
    show();
    expect(
      await screen.findByText("Die Pflanze geht mit deiner Bestätigung ins Archiv."),
    ).toBeTruthy();
  });

  it("without a name the card still says the plant goes into the archive (P-08: no invented name)", async () => {
    server({ received: [accepted({ type: "plant", specimenName: null })] });
    show();
    expect(
      await screen.findByText("Die Pflanze geht ins Archiv, sobald Ben bestätigt."),
    ).toBeTruthy();
  });

  it("after a reload the giver's handed-over plant card names it as archived and opens the archive", async () => {
    server({
      received: [
        side({
          status: "handed_over",
          type: "plant",
          specimenName: "Probe Pflanze A",
          specimenArchived: true,
          givenSpecimenId: "g1",
          handedOverAt: "2026-10-10T10:00:00.000Z",
        }),
      ],
    });
    show();
    expect(await screen.findByText("„Probe Pflanze A“ ist im Archiv.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Im Archiv ansehen" }).getAttribute("href")).toBe(
      ARCHIVE_HREF,
    );
  });

  it("US-SOZ-11 US-BES-07 a plant restored from the archive after the handover shows no archive line and no link", async () => {
    server({
      received: [
        side({
          status: "handed_over",
          type: "plant",
          specimenName: "Probe Pflanze A",
          specimenArchived: false,
          givenSpecimenId: "g1",
          handedOverAt: "2026-10-10T10:00:00.000Z",
        }),
      ],
    });
    show();
    await screen.findByRole("list", { name: "Anfragen" });
    expect(screen.queryByText(/Archiv/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Im Archiv ansehen" })).toBeNull();
  });

  it("a cutting has no archive wording before or after the confirmation; the mother plant stays in the collection", async () => {
    server({ received: [accepted({ type: "cutting", specimenName: "Probe Pflanze A" })] }, () =>
      response(200, { status: "handed_over" }),
    );
    show();
    await screen.findByRole("button", { name: "Übergabe bestätigen: Echte Aloe" });
    expect(screen.queryByText(/Archiv/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Übergabe bestätigen: Echte Aloe" }));
    expect(
      await screen.findByText(
        "Die Übergabe ist abgeschlossen. Deine Pflanze bleibt in deiner Sammlung.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Archiv/)).toBeNull();
  });

  it("an offshoot handed over shows no archive wording and no archive row", async () => {
    server({
      received: [
        side({
          status: "handed_over",
          type: "offshoot",
          specimenName: "Probe Pflanze A",
          givenSpecimenId: "g1",
          handedOverAt: "2026-10-10T10:00:00.000Z",
        }),
      ],
    });
    show();
    await screen.findByRole("list", { name: "Anfragen" });
    expect(screen.queryByText(/Archiv/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Im Archiv ansehen" })).toBeNull();
  });

  it("the recipient of a plant sees no archive wording: the new plant is in the recipient's collection", async () => {
    server({
      sent: [accepted({ role: "recipient", type: "plant", specimenName: "Probe Pflanze A" })],
    });
    show();
    await screen.findByRole("list", { name: "Anfragen" });
    expect(screen.queryByText(/Archiv/)).toBeNull();
  });
});

describe("US-QS-14 issue 1697 · the swap requests show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(
      <SwapRequestsSkeleton label={table["requests.loading"]} />,
      table["requests.loading"],
    ));
});
