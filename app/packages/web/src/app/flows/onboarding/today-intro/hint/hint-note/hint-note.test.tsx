// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteOccasion } from "../hint-api";
import { HintNote } from "./hint-note";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

/** Records the hint requests of the note; `answer` is the status of every write. */
function server(answer = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      calls.push(`${init?.method ?? "GET"} ${u.pathname}`);
      return response(answer, { occasion: u.pathname.split("/").at(-1) });
    }),
  );
  return calls;
}

const note = (occasion: NoteOccasion, onGone = vi.fn()) => (
  <MemoryRouter>
    <HintNote occasion={occasion} api="http://api" token={async () => "tok"} onGone={onGone} />
  </MemoryRouter>
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-07 · SG-COPY-05 each hint is one short sentence, exact", () => {
  it("US-ONB-07 · US-QS-32 the plant note under Messen reads exactly 'Miss sie, dann siehst du ihr Wachstum.'", async () => {
    server();
    render(note("first_plant_saved"));
    const status = await screen.findByRole("status", { name: "Hinweis" });
    expect(status.textContent).toBe("Miss sie, dann siehst du ihr Wachstum.");
  });

  it("US-ONB-07 · US-QS-32 the growth note reads exactly 'Foto und Größe zeigen ihr Wachstum.'", async () => {
    server();
    render(note("first_measurement"));
    const status = await screen.findByRole("status", { name: "Hinweis" });
    expect(status.textContent).toBe("Foto und Größe zeigen ihr Wachstum.");
  });

  it("US-ONB-07 · US-QS-32 the function note reads exactly 'Neu unter „Was die App kann“.' and its phrase opens the function overview", async () => {
    server();
    render(note("function_unlocked"));
    const status = await screen.findByRole("status", { name: "Hinweis" });
    expect(status.textContent).toBe("Neu unter „Was die App kann“.");
    const link = screen.getByRole("link", { name: "„Was die App kann“" });
    expect(link.getAttribute("href")).toBe("/account/functions");
  });

  it("US-ONB-07 · no note carries the old wording or a 'Mehr erfahren' link", async () => {
    server();
    render(note("first_measurement"));
    const status = await screen.findByRole("status", { name: "Hinweis" });
    expect(status.textContent).not.toMatch(/Mehr erfahren|Okay|Du kannst jetzt messen/);
    expect(screen.queryByRole("link", { name: /Mehr erfahren/ })).toBeNull();
  });
});

describe("US-ONB-07 · SG-ONB-02 the note closes with its X, named Hinweis schließen", () => {
  it("US-ONB-07 · SG-COPY-02 the close control is an icon named Hinweis schließen, with no text beside it", async () => {
    server();
    render(note("first_plant_saved"));
    const close = await screen.findByRole("button", { name: "Hinweis schließen" });
    expect(close.querySelector("svg")).not.toBeNull();
    expect(close.textContent).toBe("");
  });

  it("US-ONB-07 closing stores the dismissal for the account and tells the place to drop the note", async () => {
    const calls = server();
    const onGone = vi.fn();
    render(note("first_measurement", onGone));
    await userEvent.click(await screen.findByRole("button", { name: "Hinweis schließen" }));
    await waitFor(() => expect(onGone).toHaveBeenCalledOnce());
    expect(calls).toContain("PUT /onboarding/hints/first_measurement");
  });

  it("US-QS-32 · P-10 a dismissal that cannot be stored keeps the note and says so", async () => {
    server(500);
    render(note("first_plant_saved"));
    await userEvent.click(await screen.findByRole("button", { name: "Hinweis schließen" }));
    expect((await screen.findByRole("alert")).textContent).toContain("nicht speichern");
    expect(screen.getByRole("status", { name: "Hinweis" })).toBeTruthy();
  });
});
