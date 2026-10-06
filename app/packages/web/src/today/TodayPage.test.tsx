// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayPage } from "./TodayPage";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const item = (kind: string, target: string, name: string, text: string, nextAction: string) => ({
  id: `${kind}:${name}`,
  kind,
  specimenId: name,
  specimenName: name,
  text,
  nextAction,
  target,
});

function fakeServer(reply: () => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) =>
    new URL(String(url)).pathname === "/today" ? reply() : response(404, {}),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TE-07 today page", () => {
  it("TE-07 US-BEH-02 lists every entry with its state word, its text and its next action (P-09)", async () => {
    fakeServer(() =>
      response(200, {
        date: "2026-10-03",
        upcoming: 2,
        items: [
          item(
            "treatment_overdue",
            "treatments",
            "Aloe",
            "„Aloe“: Läuse – überfällig seit 2 Tagen.",
            "Hake den Termin ab.",
          ),
          item(
            "phase_deviation",
            "care_phases",
            "Efeu",
            "„Efeu“ steht nicht am Soll-Standort.",
            "Stelle es um.",
          ),
          item(
            "specimen_incomplete",
            "hints",
            "Zeder",
            "„Zeder“ hat noch keinen Standort.",
            "Weise einen Standort zu.",
          ),
        ],
      }),
    );
    render(<TodayPage api="http://api" token={token} onOpen={() => undefined} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Heute" })).toBeTruthy();
    expect(await screen.findByText("3 Dinge stehen an.")).toBeTruthy();
    expect(screen.getByText("Stand: 03.10.2026")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    for (const word of ["Überfällig", "Abweichung", "Angaben fehlen"])
      expect(screen.getByText(word)).toBeTruthy();
    expect(screen.getByText("Hake den Termin ab.")).toBeTruthy();
    expect(screen.getByText("2 weitere Behandlungstermine stehen später an.")).toBeTruthy();
  });

  it("TE-07 P-09 each entry leads to the place where it is done", async () => {
    fakeServer(() =>
      response(200, {
        date: "2026-10-03",
        upcoming: 0,
        items: [item("phase_deviation", "care_phases", "Efeu", "Text", "Stelle es um.")],
      }),
    );
    const onOpen = vi.fn();
    render(<TodayPage api="http://api" token={token} onOpen={onOpen} />);
    await userEvent.click(await screen.findByRole("button", { name: "Zu Pflegephasen: Efeu" }));
    expect(onOpen).toHaveBeenCalledWith("care_phases");
  });

  it("TE-07 P-10 an empty list says that nothing is due, names what is ahead and offers the collection", async () => {
    fakeServer(() => response(200, { date: "2026-10-03", upcoming: 1, items: [] }));
    const onOpen = vi.fn();
    render(<TodayPage api="http://api" token={token} onOpen={onOpen} />);
    expect(await screen.findByText("Heute steht nichts an.")).toBeTruthy();
    expect(screen.getByText("Ein weiterer Behandlungstermin steht später an.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zum Bestand" }));
    expect(onOpen).toHaveBeenCalledWith("collection");
  });

  it("TE-07 P-10 a failed load shows the error with a retry, no empty list", async () => {
    fakeServer(() =>
      response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
    );
    render(<TodayPage api="http://api" token={token} onOpen={() => undefined} />);
    expect(await screen.findByText("Der Server antwortet nicht.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.queryByText("Heute steht nichts an.")).toBeNull();
  });
});
