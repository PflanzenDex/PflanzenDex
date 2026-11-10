// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpecimenCard } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "../../../../collection-page/collection-page";
import { EMPTY_DISTRIBUTION } from "../../../../insights/distribution-test-helpers";
import { openPlant } from "../../../../specimens/tests/plants-test-helpers";
import { answerCardRead } from "../../../../specimens/tests/cards-fake";

// US-BES-18: the private notes of a specimen, through the plant layer and the layer of the notes (what the
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
  lightNeedUnknown: false,
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

/** The plant layer, open on its overview. */
async function overview() {
  await openPlant("Bogenhanf");
  return screen.findByRole("dialog", { name: "Bogenhanf" });
}

/** The notes of the plant: the layer above the overview. */
async function notesLayer() {
  const plant = await overview();
  await userEvent.click(within(plant).getByRole("button", { name: "Notizen: Bogenhanf" }));
  return screen.findByRole("dialog", { name: "Notizen" });
}

/** The form of the notes, opened by the filled action of the layer. */
async function notesForm(action: string) {
  const layer = await notesLayer();
  await userEvent.click(await within(layer).findByRole("button", { name: action }));
  return {
    layer,
    field: within(layer).getByLabelText("Notiz") as HTMLTextAreaElement,
    save: within(layer).getByRole("button", { name: "Notiz speichern" }),
  };
}

const detailReads = () =>
  vi.mocked(fetch).mock.calls.filter(([url]) => new URL(String(url)).pathname === "/specimens/e1");

describe("US-BES-18 the plant layer opens the private notes as their own layer", () => {
  it("US-BES-18 the overview offers the notes as a button and reads them only when their layer opens (US-QS-15)", async () => {
    fakeServer({ notes: NOTE });
    render(page());
    const plant = await overview();
    expect(within(plant).getByRole("button", { name: "Notizen: Bogenhanf" })).toBeTruthy();
    expect(within(plant).queryByText(NOTE)).toBeNull();
    expect(detailReads()).toEqual([]);
  });

  it("US-BES-18 the layer shows the notes the keeper wrote, read from the own detail", async () => {
    fakeServer({ notes: NOTE });
    render(page());
    const layer = await notesLayer();
    expect(await within(layer).findByText(NOTE)).toBeTruthy();
    expect(within(layer).getByRole("button", { name: "Notiz bearbeiten" })).toBeTruthy();
  });

  it("US-BES-18 without a note the layer says what to do and that only the keeper sees the note (P-09)", async () => {
    fakeServer();
    render(page());
    const layer = await notesLayer();
    expect(await within(layer).findByText(/Noch keine Notiz/)).toBeTruthy();
    expect(within(layer).getByText(/Nur du siehst sie/)).toBeTruthy();
    expect(within(layer).getByRole("button", { name: "Notiz schreiben" })).toBeTruthy();
  });

  it("US-BES-18 a long note shows in whole, free text may scroll inside its layer (US-QS-15)", async () => {
    fakeServer({ notes: LONG });
    render(page());
    const layer = await notesLayer();
    expect(await within(layer).findByText(LONG.trim())).toBeTruthy();
  });

  it("US-BES-18 when the notes cannot be read the layer says so and offers no write (P-10)", async () => {
    fakeServer({ detailFails: true });
    render(page());
    const layer = await notesLayer();
    expect(await within(layer).findByRole("alert")).toBeTruthy();
    expect(within(layer).queryByText(/Noch keine Notiz/)).toBeNull();
    expect(within(layer).queryByRole("button", { name: "Notiz schreiben" })).toBeNull();
  });

  it("US-BES-18 closing the layer goes back to the plant and its button (US-QS-15)", async () => {
    fakeServer({ notes: NOTE });
    render(page());
    const layer = await notesLayer();
    await within(layer).findByText(NOTE);
    await userEvent.keyboard("{Escape}");
    const plant = await screen.findByRole("dialog", { name: "Bogenhanf" });
    const opener = within(plant).getByRole("button", { name: "Notizen: Bogenhanf" });
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe("US-BES-18 change the notes in their layer", () => {
  it("US-BES-18 the form is labelled and takes the focus; saving sends the text, shows it and says what changed (P-09)", async () => {
    const posts = fakeServer();
    render(page());
    const { layer, field, save } = await notesForm("Notiz schreiben");
    expect(field.tagName).toBe("TEXTAREA");
    expect(document.activeElement).toBe(field);
    await userEvent.type(field, NOTE);
    await userEvent.click(save);
    expect(posts).toEqual([{ path: "/specimens/e1/notes", body: { notes: NOTE } }]);
    expect(
      await within(layer).findByText("Die Notiz zu „Bogenhanf“ ist gespeichert."),
    ).toBeTruthy();
    expect(within(layer).getByText(NOTE)).toBeTruthy();
    expect(document.activeElement).toBe(
      within(layer).getByRole("button", { name: "Notiz bearbeiten" }),
    );
  });

  it("US-BES-18 the saved note is shown again when the layer is opened next", async () => {
    fakeServer();
    render(page());
    const { layer, field, save } = await notesForm("Notiz schreiben");
    await userEvent.type(field, NOTE);
    await userEvent.click(save);
    await within(layer).findByText("Die Notiz zu „Bogenhanf“ ist gespeichert.");
    await userEvent.keyboard("{Escape}");
    const plant = await screen.findByRole("dialog", { name: "Bogenhanf" });
    await userEvent.click(within(plant).getByRole("button", { name: "Notizen: Bogenhanf" }));
    const again = await screen.findByRole("dialog", { name: "Notizen" });
    expect(await within(again).findByText(NOTE)).toBeTruthy();
  });

  it("US-BES-18 an empty text clears the note: an empty text is sent and the layer says it was removed", async () => {
    const posts = fakeServer({ notes: NOTE });
    render(page());
    const { layer, field, save } = await notesForm("Notiz bearbeiten");
    expect(field.value).toBe(NOTE);
    await userEvent.clear(field);
    await userEvent.click(save);
    expect(posts).toEqual([{ path: "/specimens/e1/notes", body: { notes: "" } }]);
    expect(await within(layer).findByText("Die Notiz zu „Bogenhanf“ ist entfernt.")).toBeTruthy();
    expect(within(layer).getByText(/Noch keine Notiz/)).toBeTruthy();
  });

  it("US-BES-18 cancelling writes nothing and shows the notes as they were", async () => {
    const posts = fakeServer({ notes: NOTE });
    render(page());
    const { layer, field } = await notesForm("Notiz bearbeiten");
    await userEvent.type(field, " Anders.");
    await userEvent.click(within(layer).getByRole("button", { name: "Abbrechen" }));
    expect(posts).toEqual([]);
    expect(within(layer).getByText(NOTE)).toBeTruthy();
    expect(document.activeElement).toBe(
      within(layer).getByRole("button", { name: "Notiz bearbeiten" }),
    );
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
    const { layer, field, save } = await notesForm("Notiz schreiben");
    await userEvent.type(field, NOTE);
    await userEvent.click(save);
    // The refusal names the field and shows the German text of its code (FR-QG-11): the text is not the hint of the field.
    expect(
      await within(layer).findByText(
        "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
      ),
    ).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.value).toBe(NOTE);
    expect(within(layer).queryByText(/gespeichert/)).toBeNull();
  });

  it("US-BES-18 a failed connection keeps the form and the text, and says it did not save (P-10)", async () => {
    fakeServer({ network: true });
    render(page());
    const { layer, field, save } = await notesForm("Notiz schreiben");
    await userEvent.type(field, NOTE);
    await userEvent.click(save);
    expect(await within(layer).findByRole("alert")).toBeTruthy();
    expect(field.value).toBe(NOTE);
    expect(within(layer).queryByText(/gespeichert/)).toBeNull();
  });
});
