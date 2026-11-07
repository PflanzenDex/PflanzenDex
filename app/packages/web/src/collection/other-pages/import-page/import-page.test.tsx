// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ERROR_TEXTS, IMPORT_LIMITS, type PreviewRow } from "@pflanzendex/core";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import { ImportPage } from "./import-page";
import { TEMPLATE_HEADER } from "./import-api";

// US-BES-18 (FR-BES-26): the import page through what the keeper sees. A fake server answers the preview the way the API
// does with the fixes it is sent, and the confirmation with what the test chose.
const API = "http://api";
const TOKEN = async () => "tok";
const MON = "11111111-1111-4111-8111-111111111111";
const FICUS = "22222222-2222-4222-8222-222222222222";
const HEADER = "Art;Spitzname;Standort;Kaufdatum;Notizen";
const CSV = [
  HEADER,
  "Monstera;Lulu;;;",
  "Ficus lyrata;Pit;Balkon;2026-03-01;",
  "Ficus lyrata;;;;",
  "Kaktus;;;;",
].join("\n");

type Override = { line: number; speciesId?: string; marker?: string; skip?: boolean };
type Body = {
  csv?: string;
  overrides?: Override[];
  markers?: { specimenId: string; marker: string }[];
  rows?: { line: number }[];
};
type Sent = { path: string; body: Body; key: string | null };

const row = (over: Partial<PreviewRow> & { line: number }): PreviewRow => ({
  state: "ready",
  species: { name: "", id: null, candidates: [], more: false },
  nickname: null,
  marker: null,
  specimenName: null,
  location: null,
  catchDate: null,
  notes: null,
  reasons: [],
  ...over,
});

/** The rows of the file before any fix: a partial name, a ready row, a row without a marker, an unknown species. */
const FILE_ROWS: PreviewRow[] = [
  row({
    line: 2,
    state: "flagged",
    species: {
      name: "Monstera",
      id: null,
      candidates: [{ id: MON, name: "Fensterblatt" }],
      more: false,
    },
    nickname: "Lulu",
    reasons: [{ code: "import.species_candidates", field: "species" }],
  }),
  row({
    line: 3,
    species: { name: "Ficus lyrata", id: FICUS, candidates: [], more: false },
    nickname: "Pit",
    marker: "Pit",
    specimenName: "Geigenfeige – Pit",
    location: { id: null, name: "Balkon", isNew: true },
    catchDate: "2026-03-01",
  }),
  row({
    line: 4,
    state: "flagged",
    species: { name: "Ficus lyrata", id: FICUS, candidates: [], more: false },
    specimenName: "Geigenfeige",
    reasons: [{ code: "specimen.marker_required", field: "nickname" }],
  }),
  row({
    line: 5,
    state: "flagged",
    species: { name: "Kaktus", id: null, candidates: [], more: false },
    reasons: [{ code: "import.species_not_found", field: "species" }],
  }),
];

/** One fix applied the way the server applies it: a chosen species, a marker, a skip (US-BES-18). */
function fixed(r: PreviewRow, fix: Override | undefined): PreviewRow {
  if (!fix) return r;
  if (fix.skip === true)
    return row({ line: r.line, state: "skipped", species: { ...r.species, candidates: [] } });
  if (fix.speciesId === MON && r.line === 2)
    return row({
      line: 2,
      species: { name: "Monstera", id: MON, candidates: [], more: false },
      nickname: "Lulu",
      specimenName: "Fensterblatt – Lulu",
      location: null,
    });
  if (fix.marker && r.line === 4)
    return row({
      ...r,
      state: "ready",
      marker: fix.marker,
      specimenName: `Geigenfeige – ${fix.marker}`,
      reasons: [],
    });
  return r;
}

interface Opts {
  rows?: PreviewRow[];
  /** A marker the file needs for an existing specimen (US-BES-03), until it is answered. */
  missing?: { id: string; name: string };
  previewFails?: number;
  confirmFails?: number;
  /** Rows the confirmation says were there already, and rows it refuses (P-10). */
  skipOnConfirm?: number[];
  refuseOnConfirm?: number[];
}

/** The fake API of the import: the preview answers the fixes, the confirmation answers the rows it got. */
function server(opts: Opts = {}) {
  const sent: Sent[] = [];
  let previewFails = opts.previewFails ?? 0;
  let confirmFails = opts.confirmFails ?? 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const body = init?.body ? (JSON.parse(String(init.body)) as Body) : {};
      const key = new Headers(init?.headers).get("Idempotency-Key");
      sent.push({ path, body, key });
      if (path === "/specimens/import/preview") {
        if (previewFails-- > 0) return Promise.reject(new TypeError("Failed to fetch"));
        return json(200, previewAnswer(body, opts));
      }
      if (path === "/specimens/import") {
        if (confirmFails-- > 0) return Promise.reject(new TypeError("Failed to fetch"));
        return json(200, confirmAnswer(body, opts));
      }
      return json(404, { error: { code: "system.not_found", text: "x" } });
    }),
  );
  return sent;
}

const json = (status: number, value: unknown) => Response.json(value, { status });

function previewAnswer(body: Body, opts: Opts) {
  const fixes = new Map((body.overrides ?? []).map((o) => [o.line, o] as const));
  const rows = (opts.rows ?? FILE_ROWS).map((r) => fixed(r, fixes.get(r.line)));
  const answered = new Set((body.markers ?? []).map((m) => m.specimenId));
  const markers =
    opts.missing && !answered.has(opts.missing.id)
      ? [{ speciesId: FICUS, speciesName: "Geigenfeige", missing: [opts.missing] }]
      : [];
  const count = (state: string) => rows.filter((r) => r.state === state).length;
  return {
    rows,
    counts: {
      ready: count("ready"),
      flagged: count("flagged"),
      alreadyThere: count("already_there"),
      skipped: count("skipped"),
    },
    newLocations: rows.some((r) => r.location?.isNew && r.state !== "skipped") ? ["Balkon"] : [],
    markers,
  };
}

function confirmAnswer(body: Body, opts: Opts) {
  const lines = (body.rows ?? []).map((r) => r.line);
  const refused = (opts.refuseOnConfirm ?? []).filter((l) => lines.includes(l));
  const skipped = (opts.skipOnConfirm ?? []).filter((l) => lines.includes(l));
  const created = lines
    .filter((l) => !refused.includes(l) && !skipped.includes(l))
    .map((line) => ({ line, id: `new-${line}`, name: `Pflanze ${line}` }));
  return {
    created,
    skipped: skipped.map((line) => ({ line })),
    refused: refused.map((line) => ({ line, code: "location.not_found" })),
    locationsCreated: ["Balkon"],
    unusedMarkers: [],
  };
}

function Address() {
  const at = useLocation();
  return <p data-testid="address">{`${at.pathname}${at.search}`}</p>;
}

function show(features: Record<string, boolean> = { csv_import: true }) {
  return render(
    <MemoryRouter initialEntries={["/collection/import"]}>
      <FeaturesProvider features={features}>
        <Routes>
          <Route path="/collection/import" element={<ImportPage api={API} token={TOKEN} />} />
          <Route path="/collection" element={<Address />} />
        </Routes>
      </FeaturesProvider>
    </MemoryRouter>,
  );
}

const user = () => userEvent.setup();
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;
const fileOf = (text: string, name = "pflanzen.csv") =>
  new File([text], name, { type: "text/csv" });
const reviewButton = () => screen.getByRole("button", { name: "Vorschau ansehen" });
const rowOf = (line: number): HTMLElement => {
  const el = document.getElementById(`import-row-${line}`);
  if (!el) throw new Error(`row ${line} is not on the page`);
  return el;
};
const sentTo = (sent: Sent[], path: string) => sent.filter((s) => s.path === path);

/** Picks the file and asks for the preview; returns once the preview is on the screen. */
async function previewOfCsv(text = CSV) {
  const u = user();
  await u.upload(screen.getByLabelText("CSV-Datei"), fileOf(text));
  await waitFor(() => expect(isDisabled(reviewButton())).toBe(false));
  await u.click(reviewButton());
  await screen.findByRole("heading", { name: "Vorschau" });
  return u;
}

beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
});

describe("US-BES-18 the import page follows its keeper switch and offers the template", () => {
  it("US-BES-18 with the keeper switch csv_import off the address leads to the collection", () => {
    server();
    show({ csv_import: false });
    expect(screen.getByTestId("address").textContent).toBe("/collection");
  });

  it("US-BES-18 the template is generated in the browser and holds only the header line", async () => {
    const created: Blob[] = [];
    const names: string[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => (created.push(blob), "blob:template"));
    URL.revokeObjectURL = vi.fn();
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    server();
    show();
    await user().click(screen.getByRole("button", { name: "Vorlage herunterladen" }));
    expect(created).toHaveLength(1);
    expect(await created[0]?.text()).toBe(`${TEMPLATE_HEADER}\n`);
    expect(TEMPLATE_HEADER).toBe(HEADER);
    expect(names).toEqual(["pflanzen-vorlage.csv"]);
  });

  it("US-BES-18 a file over 1 MB is refused in the browser with the server's text, and nothing is sent", async () => {
    const sent = server();
    show();
    const big = new File([new Uint8Array(IMPORT_LIMITS.bytes + 1)], "gross.csv", {
      type: "text/csv",
    });
    await user().upload(screen.getByLabelText("CSV-Datei"), big);
    expect(await screen.findByText(ERROR_TEXTS["import.too_large"])).toBeTruthy();
    expect(isDisabled(reviewButton())).toBe(true);
    expect(sent).toHaveLength(0);
  });
});

describe("US-BES-18 the preview shows counts, new locations and reasons in German", () => {
  it("US-BES-18 the preview says what is ready, flagged and new, and each reason by its text, never by its code", async () => {
    server();
    show();
    await previewOfCsv();
    expect(screen.getByText("1 bereit")).toBeTruthy();
    expect(screen.getByText("3 markiert")).toBeTruthy();
    expect(screen.getByText("0 übersprungen")).toBeTruthy();
    expect(screen.getByText("„Balkon“ wird neu angelegt, ohne Lichtzone.")).toBeTruthy();
    expect(screen.getByText(ERROR_TEXTS["import.species_not_found"])).toBeTruthy();
    expect(screen.getByText(ERROR_TEXTS["specimen.marker_required"])).toBeTruthy();
    expect(screen.queryByText(/import\.species_not_found|specimen\.marker_required/)).toBeNull();
  });

  it("US-BES-18 the preview moves the focus to its heading on arrival", async () => {
    server();
    show();
    await previewOfCsv();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Vorschau" }));
  });

  it("US-BES-18 the flagged rows are said not to be imported, before the keeper confirms", async () => {
    server();
    show();
    await previewOfCsv();
    expect(screen.getByText("3 markierte Zeilen werden nicht importiert.")).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: "1 Pflanze importieren" }))).toBe(false);
  });
});

describe("US-BES-18 each fix sends the file again and shows the new answer", () => {
  it("US-BES-18 a chosen candidate is sent as the species of its row, and the row is ready", async () => {
    const sent = server();
    show();
    await previewOfCsv();
    await user().click(
      within(rowOf(2)).getByRole("button", { name: "Diese Art wählen: Fensterblatt" }),
    );
    await waitFor(() => expect(screen.getByText("2 bereit")).toBeTruthy());
    const last = sentTo(sent, "/specimens/import/preview").at(-1);
    expect(last?.body.overrides).toContainEqual({ line: 2, speciesId: MON });
    expect(within(rowOf(2)).getByText("bereit")).toBeTruthy();
  });

  it("US-BES-18 a marker given to a row without one is sent as its marker, and the reason is gone", async () => {
    const sent = server();
    show();
    await previewOfCsv();
    const u = user();
    await u.type(within(rowOf(4)).getByLabelText("Kennzeichen"), "Rot");
    await u.click(within(rowOf(4)).getByRole("button", { name: "Kennzeichen übernehmen" }));
    await waitFor(() => expect(screen.getByText("2 bereit")).toBeTruthy());
    const last = sentTo(sent, "/specimens/import/preview").at(-1);
    expect(last?.body.overrides).toContainEqual({ line: 4, marker: "Rot" });
    expect(screen.queryByText(ERROR_TEXTS["specimen.marker_required"])).toBeNull();
  });

  it("US-BES-18 a skipped row is sent as skipped, shows as skipped, and can be taken back", async () => {
    const sent = server();
    show();
    await previewOfCsv();
    const u = user();
    await u.click(within(rowOf(5)).getByRole("button", { name: "Zeile überspringen" }));
    await waitFor(() => expect(screen.getByText("1 übersprungen")).toBeTruthy());
    expect(sentTo(sent, "/specimens/import/preview").at(-1)?.body.overrides).toContainEqual({
      line: 5,
      skip: true,
    });
    expect(within(rowOf(5)).getByText("übersprungen, wird nicht importiert")).toBeTruthy();
    await u.click(within(rowOf(5)).getByRole("button", { name: "Zeile doch aufnehmen" }));
    await waitFor(() => expect(screen.getByText("0 übersprungen")).toBeTruthy());
    expect(sentTo(sent, "/specimens/import/preview").at(-1)?.body.overrides).toContainEqual({
      line: 5,
      skip: false,
    });
  });

  it("US-BES-18 a marker the file needs for an existing specimen is asked for in a field and sent as an answer", async () => {
    const sent = server({
      missing: { id: "99999999-9999-4999-8999-999999999999", name: "Geigenfeige – Alt" },
    });
    show();
    await previewOfCsv();
    const u = user();
    const field = screen.getByLabelText("Kennzeichen für Geigenfeige – Alt");
    await u.type(field, "Neu");
    await u.click(
      within(field.closest("form") as HTMLElement).getByRole("button", {
        name: "Kennzeichen übernehmen",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Kennzeichen für Geigenfeige – Alt")).toBeNull(),
    );
    const last = sentTo(sent, "/specimens/import/preview").at(-1);
    expect(last?.body.markers).toEqual([
      { specimenId: "99999999-9999-4999-8999-999999999999", marker: "Neu" },
    ]);
  });
});

describe("US-BES-18 the import is one filled action that says what is missing", () => {
  it("US-BES-18 the filled action is disabled while nothing is ready, and the page says why", async () => {
    server({ rows: FILE_ROWS.filter((r) => r.state === "flagged") });
    show();
    await previewOfCsv();
    const action = screen.getByRole("button", { name: "0 Pflanzen importieren" });
    expect(isDisabled(action)).toBe(true);
    expect(screen.getByText(/Keine Zeile ist bereit/)).toBeTruthy();
  });

  it("US-BES-18 the import sends only the ready rows with the Idempotency-Key and lists created, skipped and refused rows", async () => {
    const sent = server({ skipOnConfirm: [3], refuseOnConfirm: [4] });
    show();
    await previewOfCsv();
    const u = user();
    await u.click(within(rowOf(2)).getByRole("button", { name: "Diese Art wählen: Fensterblatt" }));
    await u.type(within(rowOf(4)).getByLabelText("Kennzeichen"), "Rot");
    await u.click(within(rowOf(4)).getByRole("button", { name: "Kennzeichen übernehmen" }));
    await u.click(await screen.findByRole("button", { name: "3 Pflanzen importieren" }));
    await screen.findByRole("heading", { name: "Import abgeschlossen" });
    const [confirm] = sentTo(sent, "/specimens/import");
    expect(confirm?.body.rows?.map((r) => r.line)).toEqual([2, 3, 4]);
    expect(confirm?.body.rows).toContainEqual(expect.objectContaining({ line: 2, speciesId: MON }));
    expect(confirm?.body.rows).toContainEqual(
      expect.objectContaining({ line: 3, speciesId: FICUS, newLocation: "Balkon" }),
    );
    expect(confirm?.key).toBeTruthy();
    expect(screen.getByText("Angelegt: 1 · Übersprungen: 1 · Abgelehnt: 1")).toBeTruthy();
    expect(screen.getByText("Zeile 2: Pflanze 2 ist angelegt.")).toBeTruthy();
    expect(screen.getByText("Zeile 3: schon vorhanden, übersprungen.")).toBeTruthy();
    expect(screen.getByText(`Zeile 4: ${ERROR_TEXTS["location.not_found"]}`)).toBeTruthy();
  });

  it("US-BES-18 the result says which locations lack a light zone, and links to the hints", async () => {
    server();
    show();
    await previewOfCsv();
    await user().click(await screen.findByRole("button", { name: "1 Pflanze importieren" }));
    await screen.findByRole("heading", { name: "Import abgeschlossen" });
    expect(screen.getByText(/Neue Standorte ohne Lichtzone: Balkon/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Hinweise" }).getAttribute("href")).toBe(
      "/today?sheet=hints",
    );
    expect(screen.getByRole("link", { name: "Zur Sammlung" }).getAttribute("href")).toBe(
      "/collection",
    );
  });
});

describe("US-BES-18 a failed request keeps the state and offers a retry", () => {
  it("US-BES-18 a failed preview keeps the file and offers a retry that shows the preview", async () => {
    const sent = server({ previewFails: 1 });
    show();
    const u = user();
    await u.upload(screen.getByLabelText("CSV-Datei"), fileOf(CSV));
    await waitFor(() => expect(isDisabled(reviewButton())).toBe(false));
    await u.click(reviewButton());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Es wurde nichts gespeichert/)).toBeTruthy();
    expect(isDisabled(reviewButton())).toBe(false);
    await u.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await screen.findByRole("heading", { name: "Vorschau" });
    expect(sentTo(sent, "/specimens/import/preview")).toHaveLength(2);
  });

  it("US-BES-18 a failed confirmation keeps the preview, and the retry sends the same Idempotency-Key", async () => {
    const sent = server({ confirmFails: 1 });
    show();
    await previewOfCsv();
    const u = user();
    await u.click(await screen.findByRole("button", { name: "1 Pflanze importieren" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("1 bereit")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await screen.findByRole("heading", { name: "Import abgeschlossen" });
    const keys = sentTo(sent, "/specimens/import").map((s) => s.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });
});
