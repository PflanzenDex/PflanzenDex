// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ArchivedEntry, SpecimenCard } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveSpecimen, loadArchived, restoreSpecimen } from "./archived-api";
import { CollectionPage } from "./CollectionPage";
import { EMPTY_DISTRIBUTION } from "./distribution-test-helpers";

// US-BES-07: archive and restore in the UI (jsdom, server simulated).
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const card = (id: string, name: string): SpecimenCard => ({
  id,
  name,
  speciesId: "a1",
  marker: null,
  speciesName: "Bogenhanf",
  status: "plant",
  location: null,
  lightZone: null,
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
});
const entry = (extra: Partial<ArchivedEntry> = {}): ArchivedEntry => ({
  id: "e9",
  name: "Alter Ficus",
  speciesName: "Birkenfeige",
  caughtAt: "2026-01-05",
  archivedAt: "2026-10-02",
  archivedReason: "eingegangen",
  ...extra,
});

type Post = { path: string; body: Record<string, unknown>; key: string | undefined };
function fakeServer(opts: { archivedError?: Response; startArchived?: ArchivedEntry[] } = {}) {
  const cards = [card("e1", "Bogenhanf"), card("e2", "Bogenhanf – rot")];
  const archived = [...(opts.startArchived ?? [])];
  const posts: Post[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({
        path,
        body,
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
      });
      if (opts.archivedError) return opts.archivedError.clone();
      const id = path.split("/")[2] ?? "";
      if (path.endsWith("/archive")) {
        const i = cards.findIndex((k) => k.id === id);
        const [away] = cards.splice(i, 1);
        archived.push(
          entry({ id, name: away?.name ?? "", archivedReason: String(body["reason"]) }),
        );
      } else {
        archived.splice(0, archived.length, ...archived.filter((a) => a.id !== id));
      }
      return response(200, {});
    }
    if (path === "/locations") return response(200, { locations: [] });
    if (path === "/specimens/archived") return response(200, { archived });
    if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
    return response(200, { cards });
  });
  vi.stubGlobal("fetch", fetchFn);
  return { fetchFn, posts };
}
const page = () => (
  <CollectionPage
    api="http://api"
    token={async () => "tok"}
    newSpecies={null}
    onSpeciesChoose={vi.fn()}
    onCompleted={vi.fn()}
  />
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-07 client of the archive API", () => {
  it("loads the archive with bearer token", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, { archived: [entry()] }));
    expect(await loadArchived("http://api", "tok", fetchFn)).toMatchObject({
      ok: true,
      value: [{ id: "e9" }],
    });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens/archived");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("archives with reason, time zone of the device and replay-protection key", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(200, {}));
    await archiveSpecimen("http://api", "tok", { id: "e1", reason: "verkauft" }, fetchFn);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens/e1/archive");
    expect(JSON.parse(String(init?.body))).toEqual({
      reason: "verkauft",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
  });

  it("a server error stays an error with code (P-10)", async () => {
    const error = { code: "specimen.already_archived", text: "Schon archiviert." };
    const fetchFn = vi.fn<typeof fetch>(async () => response(409, { error }));
    expect(await restoreSpecimen("http://api", "tok", "e1", fetchFn)).toMatchObject({
      ok: false,
      error: { code: "specimen.already_archived" },
    });
  });
});

describe("US-BES-07 archive on the collection page", () => {
  it('every card has "Archivieren"; the dialog offers the reasons and cancels without a request', async () => {
    const { posts } = fakeServer();
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Archivieren: Bogenhanf" }));
    const form = screen.getByRole("form", { name: "Exemplar archivieren" });
    for (const g of ["eingegangen", "abgegeben", "getauscht", "verschenkt", "verkauft"])
      expect(within(form).getByRole("option", { name: g })).toBeTruthy();
    expect(within(form).getByRole("option", { name: "anderer Grund …" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("form", { name: "Exemplar archivieren" })).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("archives with the chosen reason, takes the card out of the list and says where it is now (P-09, P-10)", async () => {
    const { posts } = fakeServer();
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Archivieren: Bogenhanf" }));
    await userEvent.selectOptions(screen.getByLabelText("Grund"), "verkauft");
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      path: "/specimens/e1/archive",
      body: { reason: "verkauft" },
    });
    expect(posts[0]?.key).toBeTruthy();
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("„Bogenhanf“ ist archiviert");
    expect(status.textContent).toContain("Archiv");
    expect(screen.queryByRole("button", { name: "Archivieren: Bogenhanf" })).toBeNull();
    expect(screen.getByRole("button", { name: "Archivieren: Bogenhanf – rot" })).toBeTruthy();
  });

  it("a free reason is sent trimmed; an empty one is not sent", async () => {
    const { posts } = fakeServer();
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Archivieren: Bogenhanf" }));
    await userEvent.selectOptions(screen.getByLabelText("Grund"), "anderer Grund …");
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Grund");
    expect(posts).toHaveLength(0);
    await userEvent.type(screen.getByLabelText("Eigener Grund"), "  Katze war schneller ");
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body["reason"]).toBe("Katze war schneller");
  });

  it("if archiving fails, the dialog stays open with the error text (P-10)", async () => {
    fakeServer({
      archivedError: new Response(
        JSON.stringify({
          error: {
            code: "specimen.already_archived",
            text: "Dieses Exemplar ist schon archiviert.",
          },
        }),
        { status: 409 },
      ),
    });
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Archivieren: Bogenhanf" }));
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    expect((await screen.findByRole("alert")).textContent).toContain("schon archiviert");
    expect(screen.getByRole("form", { name: "Exemplar archivieren" })).toBeTruthy();
  });
});

describe("US-BES-07 archive and restore", () => {
  it("shows archived specimens with species, date and reason; without archive the section does not exist", async () => {
    fakeServer();
    render(page());
    await screen.findByText("Bogenhanf – rot");
    expect(screen.queryByRole("heading", { name: "Archiv" })).toBeNull();
    cleanup();
    fakeServer({ startArchived: [entry()] });
    render(page());
    const archived = await screen.findByRole("region", { name: "Archiv" });
    expect(archived.textContent).toContain("Alter Ficus");
    expect(archived.textContent).toContain("Art: Birkenfeige");
    expect(archived.textContent).toContain("Archiviert am 02.10.2026");
    expect(archived.textContent).toContain("Grund: eingegangen");
  });

  it("restoring sends the request and brings the specimen back into the cards", async () => {
    const { posts } = fakeServer({ startArchived: [entry({ id: "e1", name: "Bogenhanf" })] });
    render(page());
    await userEvent.click(
      await screen.findByRole("button", { name: "Wiederherstellen: Bogenhanf" }),
    );
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.path).toBe("/specimens/e1/restore");
    expect((await screen.findByRole("status")).textContent).toContain("wiederhergestellt");
    expect(screen.queryByRole("region", { name: "Archiv" })).toBeNull();
  });

  it("if restoring fails, the error is shown and the specimen stays in the archive (P-10)", async () => {
    fakeServer({
      startArchived: [entry()],
      archivedError: new Response(
        JSON.stringify({
          error: { code: "specimen.not_archived", text: "Nicht archiviert." },
        }),
        { status: 409 },
      ),
    });
    render(page());
    await userEvent.click(
      await screen.findByRole("button", { name: "Wiederherstellen: Alter Ficus" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain("ist nicht archiviert");
    expect(screen.getByRole("region", { name: "Archiv" })).toBeTruthy();
  });
});
