// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrivacySection } from "./privacy-section";

beforeAll(() => {
  // jsdom has no matchMedia; a wide screen shows the layers as panes (US-QS-15), a dialog would hide the rest.
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

const token = async () => "tok";
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers }));

type Deletion = { requested: false } | { requested: true; requestedAt: string; dueAt: string };

function fakeServer(initial: Deletion = { requested: false }, missingPhotos = 0) {
  let state = initial;
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const method = init?.method ?? "GET";
      calls.push(`${method} ${path}`);
      if (path === "/account/deletion" && method === "GET") return json(200, state);
      if (path === "/account/deletion" && method === "POST") {
        expect(JSON.parse(String(init?.body))).toEqual({ confirm: true });
        state = {
          requested: true,
          requestedAt: "2026-10-16T10:00:00Z",
          dueAt: "2026-10-23T10:00:00Z",
        };
        return json(200, state);
      }
      if (path === "/account/deletion" && method === "DELETE") {
        state = { requested: false };
        return json(200, state);
      }
      if (path === "/account/export")
        return Promise.resolve(
          new Response(new Blob(["zip"]), {
            status: 200,
            headers: { "x-missing-photos": String(missingPhotos) },
          }),
        );
      return json(404, {});
    }),
  );
  return calls;
}

const saved = vi.fn();
function stubDownload() {
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved(this.download);
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  saved.mockClear();
});

const show = () =>
  render(
    <MemoryRouter>
      <PrivacySection api="http://api" token={token} />
    </MemoryRouter>,
  );
const exportRow = () => screen.findByRole("button", { name: /^Meine Daten herunterladen/ });
const deleteRow = () => screen.findByRole("button", { name: /^Konto löschen/ });

describe("US-QS-17 Meine Daten as two rows", () => {
  it("US-QS-17 · US-QS-15 shows two rows, each opens its own layer; nothing of the layers shows before", async () => {
    fakeServer();
    show();
    expect(await exportRow()).toBeTruthy();
    expect(await deleteRow()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Daten herunterladen" })).toBeNull();
    expect(screen.queryByText("Das wird gelöscht:")).toBeNull();
  });
});

describe("US-ACC-04 download of all own data", () => {
  it("US-ACC-04 one tap fetches the archive, saves it and says what it holds", async () => {
    stubDownload();
    fakeServer();
    show();
    await userEvent.click(await exportRow());
    await userEvent.click(await screen.findByRole("button", { name: "Daten herunterladen" }));
    expect(await screen.findByText(/Alle deine Fotos sind dabei/)).toBeTruthy();
    expect(saved).toHaveBeenCalledWith("pflanzendex-export.zip");
  });

  it("US-ACC-04 names photos that are missing from the store instead of hiding them (P-10)", async () => {
    stubDownload();
    fakeServer({ requested: false }, 2);
    show();
    await userEvent.click(await exportRow());
    await userEvent.click(await screen.findByRole("button", { name: "Daten herunterladen" }));
    expect(await screen.findByText(/2 Fotos fehlen im Speicher/)).toBeTruthy();
  });

  it("US-ACC-04 a failing download shows the error and saves nothing", async () => {
    stubDownload();
    fakeServer();
    vi.mocked(fetch).mockImplementation(async (url) =>
      new URL(String(url)).pathname === "/account/export"
        ? json(502, { error: { code: "media.storage_unavailable", text: "x" } })
        : json(200, { requested: false }),
    );
    show();
    await userEvent.click(await exportRow());
    await userEvent.click(await screen.findByRole("button", { name: "Daten herunterladen" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Bild|Speicher/i);
    expect(saved).not.toHaveBeenCalled();
  });
});

describe("US-ACC-04 deleting the account", () => {
  it("US-ACC-04 names what is removed and what stays before anything can be confirmed", async () => {
    fakeServer();
    show();
    await userEvent.click(await deleteRow());
    expect(await screen.findByText("Das wird gelöscht:")).toBeTruthy();
    expect(screen.getByText("Das bleibt:")).toBeTruthy();
    expect(screen.getByText(/abgeschlossene Tausche beim Tauschpartner/)).toBeTruthy();
    expect(screen.queryByLabelText("Zur Bestätigung LÖSCHEN eingeben")).toBeNull();
  });

  it("US-ACC-04 asks for the typed confirmation word in a second step and only then requests the deletion", async () => {
    const calls = fakeServer();
    show();
    await userEvent.click(await deleteRow());
    await userEvent.click(await screen.findByRole("button", { name: "Weiter" }));
    const confirm = await screen.findByRole("button", { name: "Konto in 7 Tagen löschen" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Zur Bestätigung LÖSCHEN eingeben"), "löschen");
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(calls).not.toContain("POST /account/deletion");
    await userEvent.clear(screen.getByLabelText("Zur Bestätigung LÖSCHEN eingeben"));
    await userEvent.type(screen.getByLabelText("Zur Bestätigung LÖSCHEN eingeben"), "LÖSCHEN");
    await userEvent.click(confirm);
    await waitFor(() => expect(calls).toContain("POST /account/deletion"));
    expect(await screen.findByText(/werden am/)).toBeTruthy();
    expect(screen.getAllByText(/23\. Oktober 2026/).length).toBeGreaterThan(0);
  });

  it("US-ACC-04 shows the deadline of a requested deletion in its row and takes it back on request", async () => {
    const calls = fakeServer({
      requested: true,
      requestedAt: "2026-10-16T10:00:00Z",
      dueAt: "2026-10-23T10:00:00Z",
    });
    show();
    expect(await screen.findByText(/Löschung vorgemerkt für 23\. Oktober 2026/)).toBeTruthy();
    await userEvent.click(await deleteRow());
    await userEvent.click(await screen.findByRole("button", { name: "Löschung zurücknehmen" }));
    expect(await screen.findByText(/Die Löschung ist zurückgenommen/)).toBeTruthy();
    expect(calls).toContain("DELETE /account/deletion");
    expect(await screen.findByText(/Noch nichts vorgemerkt/)).toBeTruthy();
  });

  it("US-ACC-04 a refusal of the server stays visible and nothing is shown as done (P-10)", async () => {
    fakeServer();
    show();
    vi.mocked(fetch).mockImplementation(async (url, init) =>
      init?.method === "POST"
        ? json(400, { error: { code: "input.invalid", text: "x" } })
        : json(200, { requested: false }),
    );
    await userEvent.click(await deleteRow());
    await userEvent.click(await screen.findByRole("button", { name: "Weiter" }));
    await userEvent.type(
      await screen.findByLabelText("Zur Bestätigung LÖSCHEN eingeben"),
      "LÖSCHEN",
    );
    await userEvent.click(screen.getByRole("button", { name: "Konto in 7 Tagen löschen" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Eingabe/);
    expect(screen.queryByText(/Die Löschung ist vorgemerkt/)).toBeNull();
  });
});
