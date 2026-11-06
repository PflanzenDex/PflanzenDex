// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species, SpecimenCard } from "@pflanzendex/core";
import { encode } from "uqr";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import { PrintLabelsPage } from "./print-labels-page";

// The QR code is encoded by uqr. The tests read the text that goes into the code, not the picture (US-BES-17, FR-BES-25).
vi.mock("uqr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("uqr")>();
  return { ...actual, encode: vi.fn(actual.encode) };
});

const json = (status: number, body: unknown) => Response.json(body, { status });
const TOKEN = async () => "tok";
const API = "http://api";

const card = (over: Partial<SpecimenCard> = {}): SpecimenCard => ({
  id: "e1",
  name: "Aloe vera",
  speciesId: "s1",
  marker: null,
  speciesName: "Aloe",
  status: "plant",
  location: "Fensterbank",
  lightZone: null,
  lightZoneSource: null,
  caughtAt: null,
  provenance: null,
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
  ...over,
});

/** A species with or without a cultivar; the page reads only its cultivar. */
const species = (cultivar: string | null, id = "s1") =>
  ({ id, latinName: "Aloe vera", cultivar }) as unknown as Species;

/**
 * The plant list and the species reads. A species given as "fail" answers an error; an unknown route answers 404.
 * Returns the fetch mock, so a test can see what was asked.
 */
function server(cards: SpecimenCard[], speciesById: Record<string, Species | "fail"> = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/specimens/cards") return json(200, { cards, total: cards.length, next: null });
    const id = /^\/species\/(.+)$/.exec(path)?.[1] ?? "";
    const entry = speciesById[id];
    if (entry === undefined) return json(404, { error: { code: "species.not_found", text: "x" } });
    if (entry === "fail") return json(500, { error: { code: "internal", text: "x" } });
    return json(200, entry);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function Address() {
  const at = useLocation();
  return <p data-testid="address">{`${at.pathname}${at.search}`}</p>;
}

function show(features: Record<string, boolean> = { pot_labels: true }) {
  return render(
    <MemoryRouter initialEntries={["/collection/labels"]}>
      <FeaturesProvider features={features}>
        <Routes>
          <Route path="/collection/labels" element={<PrintLabelsPage api={API} token={TOKEN} />} />
          <Route path="/collection" element={<Address />} />
        </Routes>
      </FeaturesProvider>
    </MemoryRouter>,
  );
}

const printRegion = () => screen.getByRole("region", { name: "Etiketten zum Drucken" });
const labelsOf = () => within(printRegion()).getAllByRole("article");
const pick = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) =>
  user.click(await screen.findByRole("checkbox", { name }));
const chooseFormat = (user: ReturnType<typeof userEvent.setup>, format: string) =>
  user.selectOptions(screen.getByRole("combobox", { name: "Format" }), format);
const printButton = () => screen.getByRole("button", { name: "Drucken" }) as HTMLButtonElement;

beforeEach(() => {
  vi.mocked(encode).mockClear();
  vi.spyOn(window, "print").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("US-BES-17 printing QR pot labels", () => {
  it("US-BES-17 a label shows the plant's name and its QR code", async () => {
    server([card()], { s1: species(null) });
    const user = userEvent.setup();
    show();
    await pick(user, /Aloe vera/);
    await chooseFormat(user, "A4-Bogen");
    const [label] = labelsOf();
    expect(labelsOf()).toHaveLength(1);
    expect(label?.textContent).toContain("Aloe vera");
    expect(label?.querySelector("svg path")).not.toBeNull();
  });

  it("US-BES-17 a label shows the cultivar when its species has one, and a plant without one has no empty line", async () => {
    server(
      [card({ id: "e1", name: "Aloe vera" }), card({ id: "e2", name: "Hoya", speciesId: "s2" })],
      { s1: species(null, "s1"), s2: species("Krimson Queen", "s2") },
    );
    const user = userEvent.setup();
    show();
    await pick(user, /Aloe vera/);
    await pick(user, /Hoya/);
    await chooseFormat(user, "A4-Bogen");
    await within(printRegion()).findByText("'Krimson Queen'");
    const hoya = labelsOf().find((l) => l.textContent?.includes("Hoya"));
    const aloe = labelsOf().find((l) => l.textContent?.includes("Aloe vera"));
    expect(hoya?.textContent).toContain("'Krimson Queen'");
    expect(aloe?.textContent?.trim()).toBe("Aloe vera");
    expect(aloe?.querySelectorAll("p:empty")).toHaveLength(0);
  });

  it("US-BES-17 the QR text is exactly the address of the plant and holds no plant name, location or account", async () => {
    server([card()], { s1: species(null) });
    const user = userEvent.setup();
    show();
    await pick(user, /Aloe vera/);
    await chooseFormat(user, "A4-Bogen");
    await waitFor(() => expect(printButton().disabled).toBe(false));
    expect(encode).toHaveBeenCalledWith(
      `${window.location.origin}/label/e1`,
      expect.objectContaining({ ecc: "M" }),
    );
    for (const [text] of vi.mocked(encode).mock.calls) {
      expect(String(text)).not.toMatch(/Aloe|Fensterbank|Konto|Krimson/i);
    }
  });

  it("US-BES-17 the format switch: the sheet holds the labels in a grid, the single format prints one label per page", async () => {
    server([card(), card({ id: "e2", name: "Hoya", speciesId: "s2" })], {
      s1: species(null),
      s2: species(null, "s2"),
    });
    const user = userEvent.setup();
    show();
    await pick(user, /Aloe vera/);
    await pick(user, /Hoya/);
    await chooseFormat(user, "A4-Bogen");
    expect(printRegion().dataset.format).toBe("sheet");
    expect(labelsOf()).toHaveLength(2);
    await chooseFormat(user, "Einzeletikett");
    expect(printRegion().dataset.format).toBe("single");
    expect(labelsOf()).toHaveLength(2);
    expect(labelsOf().every((l) => l.dataset.format === "single")).toBe(true);
  });

  it("US-BES-17 the labels sit in a section marked data-print-labels, a direct child of body, so only they print", async () => {
    server([card()], { s1: species(null) });
    const user = userEvent.setup();
    show();
    await pick(user, /Aloe vera/);
    await chooseFormat(user, "A4-Bogen");
    expect(printRegion().hasAttribute("data-print-labels")).toBe(true);
    expect(printRegion().parentElement).toBe(document.body);
  });

  it("US-BES-17 with nothing chosen Drucken is disabled and says what to do next (P-09)", async () => {
    server([card()], { s1: species(null) });
    const user = userEvent.setup();
    show();
    await screen.findByRole("checkbox", { name: /Aloe vera/ });
    expect(printButton().disabled).toBe(true);
    expect(screen.getByText("Wähle mindestens eine Pflanze aus.")).toBeTruthy();
    await pick(user, /Aloe vera/);
    expect(printButton().disabled).toBe(true);
    expect(screen.getByText("Wähle das Format: A4-Bogen oder Einzeletikett.")).toBeTruthy();
    await chooseFormat(user, "Einzeletikett");
    await waitFor(() => expect(printButton().disabled).toBe(false));
    await user.click(printButton());
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("US-BES-17 a species that cannot be read leaves its cultivar out and the page says so (P-10)", async () => {
    server([card()], { s1: "fail" });
    const user = userEvent.setup();
    show();
    await pick(user, /Aloe vera/);
    await chooseFormat(user, "A4-Bogen");
    expect(await screen.findByText(/konnte nicht für alle Etiketten geladen werden/)).toBeTruthy();
    expect(labelsOf()[0]?.textContent?.trim()).toBe("Aloe vera");
    await waitFor(() => expect(printButton().disabled).toBe(false));
  });

  it("US-BES-17 the page fills one screen and its list pages by the free height (US-QS-15, DS-61)", async () => {
    server([card()]);
    show();
    const list = await screen.findByRole("list", { name: "Pflanzen" });
    const frame = list.closest("[data-fit-screen]");
    expect(frame?.hasAttribute("data-fit-fill")).toBe(true);
    expect(list.hasAttribute("data-page-fit")).toBe(true);
  });

  it("US-BES-17 without plants the page offers the way to the collection (P-09)", async () => {
    server([]);
    show();
    expect(await screen.findByText("Du hast noch keine Pflanze.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zur Sammlung" }).getAttribute("href")).toBe(
      "/collection",
    );
  });

  it("US-BES-17 with the keeper switch for pot labels off, the address redirects to the collection and no plant is read (P-12)", async () => {
    const fetchMock = server([card()], { s1: species(null) });
    show({ pot_labels: false });
    expect((await screen.findByTestId("address")).textContent).toBe("/collection");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
