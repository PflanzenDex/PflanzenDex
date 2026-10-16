// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AchievementsOverviewSection } from "./overview";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  earnedOn: null,
  specimenId: null,
  specimenName: null,
  nextStep: null,
  missing: null,
  ...extra,
});
const step = (key: string, specimenName: string | null = null) => ({
  key,
  specimenId: null,
  specimenName,
});

function serve(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => response(status, body)),
  );
  render(
    <MemoryRouter>
      <AchievementsOverviewSection api="http://api" token={token} />
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const empty = (group: string) => ({ group, earned: [], open: [] });

describe("US-ACH-02 achievements overview", () => {
  it("US-ACH-02 earned ones show name, date and specimen, open ones the next step and what is missing", async () => {
    serve({
      calmMode: false,
      earnedCount: 1,
      firstStep: null,
      groups: [
        {
          group: "care",
          earned: [item("cutting-rooted", { earnedOn: "2026-05-04", specimenName: "Aloe 1" })],
          open: [
            item("treatment-completed", {
              nextStep: step("treatment-completed.next", "Aloe 2"),
            }),
          ],
        },
        {
          group: "growth",
          earned: [],
          open: [
            item("first-measurement-photo", {
              nextStep: step("first-measurement-photo.next"),
              missing: "no_measurements",
            }),
          ],
        },
        empty("swapping"),
        empty("collecting"),
      ],
    });
    const care = await screen.findByRole("region", { name: "Pflege" });
    expect(within(care).getByText("Steckling bewurzelt")).toBeTruthy();
    expect(care.textContent).toContain("Erreicht am 04.05.2026 mit Aloe 1");
    expect(care.textContent).toContain(
      "Nächster Schritt: Hake das letzte offene Datum der Kur bei Aloe 2 ab.",
    );
    const growth = screen.getByRole("region", { name: "Wachstum" });
    expect(growth.textContent).toContain("Es gibt noch keine Messung.");
    expect(screen.queryByText(/Dein erster Schritt/)).toBeNull();
  });

  it("US-ACH-02 the group Sammeln links to the Pokédex and shows no achievements of its own", async () => {
    serve({ calmMode: false, earnedCount: 0, firstStep: null, groups: [empty("collecting")] });
    const group = await screen.findByRole("region", { name: "Sammeln" });
    expect(within(group).getByRole("link", { name: "Pokédex" }).getAttribute("href")).toBe(
      "/collection?view=species",
    );
  });

  it("US-ACH-02 without data the overview names the first step instead of an empty list", async () => {
    serve({
      calmMode: false,
      earnedCount: 0,
      firstStep: step("first-measurement-photo.next"),
      groups: [empty("care")],
    });
    expect(
      await screen.findByText(
        "Dein erster Schritt: Miss ein Exemplar und füge der Messung ein Foto hinzu.",
      ),
    ).toBeTruthy();
  });

  it("US-ACH-02 no percentage, no score, no comparison with others is shown", async () => {
    serve({ calmMode: false, earnedCount: 0, firstStep: null, groups: [empty("care")] });
    await screen.findByRole("region", { name: "Pflege" });
    expect(document.body.textContent).not.toMatch(/%|Punkte|Rang \d|seltener/);
  });

  it("US-ACH-08 in calm mode nothing of the overview is shown", async () => {
    serve({ calmMode: true });
    await vi.waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("region")).toBeNull();
  });
});
