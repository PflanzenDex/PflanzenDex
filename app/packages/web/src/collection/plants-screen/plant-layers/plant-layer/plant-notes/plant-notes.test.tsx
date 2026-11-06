// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "../../../../collection-page/collection-page";
import { EMPTY_DISTRIBUTION } from "../../../../insights/distribution-test-helpers";
import { findCardButton, openPlant } from "../../../../specimens/tests/plants-test-helpers";
import { answerCardRead } from "../../../../specimens/tests/cards-fake";

// US-BES-18: the private notes of a specimen, through the plant layer and the form of the collection page (what the
// keeper sees). The fake server keeps the notes between the reads and the writes, as the API does.
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const card = (extra: Partial<SpecimenCard> = {}): SpecimenCard => ({
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
  ...extra,
});

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const NOTE = "Nur morgens gießen, nie im Wasser stehen lassen.";
const LONG = `${"Ableger im Frühjahr teilen und in Erde mit Perlit setzen. ".repeat(8)}Ende.`;

type Post = { path: string; body: Record<string, unknown> };

/**
 * The API of the plant with its notes: the detail (`GET /specimens/e1`) and the write (`POST /specimens/e1/notes`).
 * `refuse` answers the write with an error instead; `network` makes the write fail before it is answered.
 */
function fakeServer(
  opt: {
    notes?: string | null;
    refuse?: { status: number; body: unknown };
    network?: boolean;
    detailFails?: boolean;
  } = {},
) {
  let notes: string | null = opt.notes ?? null;
  const posts: Post[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      const path = u.pathname;
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push({ path, body });
        if (opt.network) throw new TypeError("Failed to fetch");
        if (opt.refuse) return json(opt.refuse.status, opt.refuse.body);
        const text = typeof body["notes"] === "string" ? body["notes"].trim() : "";
        notes = text === "" ? null : text;
        return json(200, { id: "e1", notes });
      }
      if (path === "/specimens/e1") {
        return opt.detailFails
          ? json(500, { error: { code: "system.unexpected", text: "Unerwartet." } })
          : json(200, { id: "e1", notes });
      }
      if (path === "/locations") return json(200, { locations: [] });
      if (path === "/specimens/archived") return json(200, { archived: [] });
      if (path === "/specimens/distribution") return json(200, EMPTY_DISTRIBUTION);
      return answerCardRead(u, [card()]) ?? json(404, {});
    }),
  );
  return posts;
}

const page = () => (
  <MemoryRouter>
    <CollectionPage
      api="http://api"
      token={async () => "tok"}
      newSpecies={null}
      onSpeciesChoose={vi.fn()}
      onCompleted={vi.fn()}
    />
  </MemoryRouter>
);

/** The overview of the plant layer, where the notes are. */
async function overview() {
  await openPlant("Bogenhanf");
  return screen.findByRole("dialog", { name: "Bogenhanf" });
}

describe("US-BES-18 the overview shows the private notes of the plant", () => {
  it("US-BES-18 the layer shows the notes the keeper wrote, read from the own detail", async () => {
    fakeServer({ notes: NOTE });
    render(page());
    const layer = await overview();
    expect(await within(layer).findByText(NOTE)).toBeTruthy();
    expect(within(layer).getByRole("heading", { name: "Notizen" })).toBeTruthy();
    expect(within(layer).getByRole("button", { name: "Notiz bearbeiten: Bogenhanf" })).toBeTruthy();
  });

  it("US-BES-18 without a note the overview says what to do and that only the keeper sees the note (P-09)", async () => {
    fakeServer();
    render(page());
    const layer = await overview();
    expect(await within(layer).findByText(/Noch keine Notiz/)).toBeTruthy();
    expect(within(layer).getByText(/Nur du siehst sie/)).toBeTruthy();
    expect(within(layer).getByRole("button", { name: "Notiz schreiben: Bogenhanf" })).toBeTruthy();
  });

  it("US-BES-18 a long note is cut, and a button reads all of it (the layer fits one screen, US-QS-15)", async () => {
    fakeServer({ notes: LONG });
    render(page());
    const layer = await overview();
    const more = await within(layer).findByRole("button", { name: "Alle lesen" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(within(layer).getByText(LONG.trim())).toBeTruthy();
  });

  it("US-BES-18 when the notes cannot be read the overview says so (P-10)", async () => {
    fakeServer({ detailFails: true });
    render(page());
    const layer = await overview();
    expect(await within(layer).findByRole("alert")).toBeTruthy();
    expect(within(layer).queryByText(/Noch keine Notiz/)).toBeNull();
  });
});

describe("US-BES-18 change the notes through the form of the page", () => {
  it("US-BES-18 the form is labelled and keyboard reachable; saving sends the text and says what changed (P-09)", async () => {
    const posts = fakeServer();
    render(page());
    await findCardButton("Notiz schreiben: Bogenhanf");
    await userEvent.click(screen.getByRole("button", { name: "Notiz schreiben: Bogenhanf" }));
    const field = screen.getByLabelText("Notiz") as HTMLTextAreaElement;
    expect(field.tagName).toBe("TEXTAREA");
    await userEvent.type(field, NOTE);
    await userEvent.click(screen.getByRole("button", { name: "Notiz speichern" }));
    expect(posts).toEqual([{ path: "/specimens/e1/notes", body: { notes: NOTE } }]);
    expect(await screen.findByText("Die Notiz zu „Bogenhanf“ ist gespeichert.")).toBeTruthy();
  });

  it("US-BES-18 the saved note is shown again when the plant is opened next", async () => {
    fakeServer();
    render(page());
    await findCardButton("Notiz schreiben: Bogenhanf");
    await userEvent.click(screen.getByRole("button", { name: "Notiz schreiben: Bogenhanf" }));
    await userEvent.type(screen.getByLabelText("Notiz"), NOTE);
    await userEvent.click(screen.getByRole("button", { name: "Notiz speichern" }));
    await screen.findByText("Die Notiz zu „Bogenhanf“ ist gespeichert.");
    const layer = await overview();
    expect(await within(layer).findByText(NOTE)).toBeTruthy();
  });

  it("US-BES-18 an empty text clears the note: null is sent and the page says it was removed", async () => {
    const posts = fakeServer({ notes: NOTE });
    render(page());
    await findCardButton("Notiz bearbeiten: Bogenhanf");
    await userEvent.click(screen.getByRole("button", { name: "Notiz bearbeiten: Bogenhanf" }));
    const field = screen.getByLabelText("Notiz") as HTMLTextAreaElement;
    expect(field.value).toBe(NOTE);
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole("button", { name: "Notiz speichern" }));
    expect(posts).toEqual([{ path: "/specimens/e1/notes", body: { notes: "" } }]);
    expect(await screen.findByText("Die Notiz zu „Bogenhanf“ ist entfernt.")).toBeTruthy();
  });

  it("US-BES-18 a refused save marks the field and keeps the text (P-10)", async () => {
    fakeServer({
      refuse: {
        status: 400,
        body: {
          error: { code: "input.invalid", details: [{ field: "notes", code: "input.invalid" }] },
        },
      },
    });
    render(page());
    await findCardButton("Notiz schreiben: Bogenhanf");
    await userEvent.click(screen.getByRole("button", { name: "Notiz schreiben: Bogenhanf" }));
    const field = screen.getByLabelText("Notiz") as HTMLTextAreaElement;
    await userEvent.type(field, NOTE);
    await userEvent.click(screen.getByRole("button", { name: "Notiz speichern" }));
    // The refusal names the field and shows the German text of its code (FR-QG-11): the text is not the hint of the field.
    expect(
      await screen.findByText("Die Eingabe ist ungültig. Bitte prüfe die markierten Felder."),
    ).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.value).toBe(NOTE);
    expect(screen.queryByText(/gespeichert/)).toBeNull();
  });

  it("US-BES-18 a failed connection keeps the form and the text, and says it did not save (P-10)", async () => {
    fakeServer({ network: true });
    render(page());
    await findCardButton("Notiz schreiben: Bogenhanf");
    await userEvent.click(screen.getByRole("button", { name: "Notiz schreiben: Bogenhanf" }));
    const field = screen.getByLabelText("Notiz") as HTMLTextAreaElement;
    await userEvent.type(field, NOTE);
    await userEvent.click(screen.getByRole("button", { name: "Notiz speichern" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(field.value).toBe(NOTE);
    expect(screen.queryByText(/gespeichert/)).toBeNull();
  });
});
