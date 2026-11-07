// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openPlant, openTab } from "../../../specimens/tests/plants-test-helpers";
import {
  fakeRepotServer,
  planReads,
  renderCollection,
  type Post,
} from "./repot-test-helpers/repot-test-helpers";

// US-BES-19: the part "Umtopfen" of the plant layer's tab Pflege, through what the keeper sees: the hints with their
// reason and source, the season, the pots, the observations on one line, and the layer that ticks them. The fake server
// keeps the observations between the reads and the writes.
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

/** Opens the tab Pflege of the plant and lets its plan answer: the plan is read with the tab. */
async function openPflege() {
  await openPlant("Bogenhanf");
  await openTab("Pflege");
  await waitFor(() => expect(planReads().length).toBeGreaterThan(0));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

/** The labels of the parts of "Pflege", in their order. */
const partsOf = () =>
  within(screen.getByRole("group", { name: "Teile der Pflege" }))
    .getAllByRole("button")
    .map((b) => b.textContent);

/**
 * Opens the part "Umtopfen" of the open tab Pflege and returns its region, once the plan has loaded. Without the part (the
 * repot planner switched off) it returns null.
 */
async function openPlan(): Promise<HTMLElement | null> {
  await openPflege();
  const part = screen.queryByRole("button", { name: "Umtopfen" });
  if (part === null) return null;
  await userEvent.click(part);
  await waitFor(() => expect(screen.queryByText("Umtopfen wird geladen …")).toBeNull());
  return screen.getByRole("region", { name: "Umtopfen" });
}

/**
 * Opens the layer "Beobachtungen" from the part with its action "Beobachtungen notieren" (US-BES-19). The layer holds the
 * three observations; the part is not shown while the layer is open, so the layer is queried from the screen.
 */
async function openSigns(section: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(within(section).getByRole("button", { name: "Beobachtungen notieren" }));
  return screen.findByRole("dialog", { name: "Beobachtungen" });
}

const posts = (all: Post[]) => all.filter((p) => p.path === "/specimens/e1/repot-signs");

describe("US-BES-19 the plant layer shows the repot plan as the part Umtopfen of the tab Pflege", () => {
  it("US-BES-19 the tab Pflege offers Umtopfen as a third part, and Behandlungen stays the first part", async () => {
    fakeRepotServer();
    renderCollection();
    await openPflege();
    expect(partsOf()).toEqual(["Behandlungen", "Pflegeprofil", "Umtopfen"]);
    expect(screen.getByRole("button", { name: "Behandlungen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("US-BES-19 without a hint it says there is no reason to repot and shows the day of the last repot", async () => {
    fakeRepotServer();
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Gerade kein Grund zum Umtopfen.")).toBeTruthy();
    expect(section.getByText("Zuletzt umgetopft: 05.03.2026")).toBeTruthy();
    expect(section.getByRole("button", { name: "Umgetopft" })).toBeTruthy();
  });

  it("US-BES-19 an interval hint names the months since the last repot and the general starting value (P-08)", async () => {
    fakeRepotServer({
      plan: {
        lastRepot: "2024-10-01",
        hints: [{ reason: "interval", monthsAgo: 25, source: "general_starting_value" }],
        seasonAdvice: "spring",
        phase: "dormancy",
      },
    });
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Seit 25 Monaten nicht umgetopft.")).toBeTruthy();
    expect(section.getByText("Allgemeiner Richtwert: alle 24 Monate umtopfen.")).toBeTruthy();
    expect(section.getByText("Zuletzt umgetopft: 01.10.2024")).toBeTruthy();
  });

  it("US-BES-19 an observation hint names its sign and the day it was ticked", async () => {
    fakeRepotServer({
      plan: {
        hints: [{ reason: "roots_out", tickedOn: "2026-11-02", source: "keeper_observation" }],
      },
    });
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Wurzeln aus dem Topf (notiert am 02.11.2026)")).toBeTruthy();
  });

  it("US-BES-19 in dormancy the hint suggests repotting in spring, and an unknown phase says so (P-09)", async () => {
    fakeRepotServer({
      plan: {
        hints: [{ reason: "tips_over", tickedOn: "2026-11-02", source: "keeper_observation" }],
        seasonAdvice: "spring",
        phase: "dormancy",
      },
    });
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Die Pflanze ruht gerade. Besser im Frühjahr umtopfen.")).toBeTruthy();
  });

  it("US-BES-19 with an unknown care phase the hint says that spring is the safest time (P-08)", async () => {
    fakeRepotServer({
      plan: {
        hints: [{ reason: "dries_fast", tickedOn: "2026-11-02", source: "keeper_observation" }],
        seasonAdvice: "phase_unknown",
        phase: null,
      },
    });
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(
      section.getByText("Die Pflegephase ist unbekannt. Im Frühjahr umzutopfen ist am sichersten."),
    ).toBeTruthy();
  });

  it("US-BES-19 a plant without a known repot day says so and shows no time hint (P-08)", async () => {
    fakeRepotServer({ plan: { lastRepot: null, hints: [] } });
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Zuletzt umgetopft: unbekannt")).toBeTruthy();
    expect(section.queryByText(/Seit .* nicht umgetopft/)).toBeNull();
  });

  it("US-BES-19 the current pot shows its size, or that the size is unknown, or that there is none (P-08)", async () => {
    fakeRepotServer({
      plan: { currentPot: { id: "p0", name: "Terrakotta", diameterCm: 12 } },
    });
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Topf: Terrakotta, 12 cm Durchmesser")).toBeTruthy();
  });

  it("US-BES-19 a current pot of unknown size reads Größe unbekannt, no pot reads unbekannt", async () => {
    fakeRepotServer({ plan: { currentPot: { id: "p0", name: "Kunststoff", diameterCm: null } } });
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Topf: Kunststoff, Größe unbekannt")).toBeTruthy();
  });

  it("US-BES-19 without a recorded pot the section says so", async () => {
    fakeRepotServer();
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Topf: unbekannt")).toBeTruthy();
  });

  it("US-BES-19 the free pots are listed with their size in the order the plan gives", async () => {
    fakeRepotServer({
      plan: {
        freePots: [
          { id: "p1", name: "Topf A", diameterCm: 14 },
          { id: "p2", name: "Topf B", diameterCm: null },
        ],
      },
    });
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    const list = section.getByRole("list", { name: "Freie Töpfe" });
    // A size keeps its unit with a non-breaking space (keepTogether, US-QS-15); the test reads it as a plain space.
    const items = within(list)
      .getAllByRole("listitem")
      .map((li) => li.textContent?.replaceAll(" ", " "));
    expect(items).toEqual(["Topf A · 14 cm", "Topf B · Größe unbekannt"]);
  });

  it("US-BES-19 · P-09 without a free pot one line says so and links to the equipment", async () => {
    fakeRepotServer();
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Kein Topf frei.")).toBeTruthy();
    const link = section.getByRole("link", { name: "Topf unter Geräte anlegen" });
    expect(link.getAttribute("href")).toBe("/collection?view=equipment");
    // The link stands on the line of the sentence, not below it.
    expect(link.parentElement?.contains(section.getByText("Kein Topf frei."))).toBe(true);
  });

  it("US-BES-19 · P-12 with the equipment switched off the pots are not shown", async () => {
    fakeRepotServer({
      plan: { equipmentOff: true, freePots: [{ id: "p1", name: "Topf A", diameterCm: 14 }] },
    });
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.queryByText("Freie Töpfe")).toBeNull();
    expect(section.queryByText("Kein Topf frei.")).toBeNull();
    expect(section.queryByRole("link", { name: "Topf unter Geräte anlegen" })).toBeNull();
  });

  it("US-BES-19 · P-12 with the repot planner switched off the part Umtopfen is not offered", async () => {
    fakeRepotServer({ plan: { hidden: true, currentPot: null, freePots: [] } });
    renderCollection();
    expect(await openPlan()).toBeNull();
    expect(partsOf()).toEqual(["Behandlungen", "Pflegeprofil"]);
  });

  it("US-BES-19 a cutting has no part Umtopfen and its plan is never read", async () => {
    fakeRepotServer({ card: { status: "cutting" } });
    renderCollection();
    await openPlant("Bogenhanf");
    await openTab("Pflege");
    expect(partsOf()).toEqual(["Behandlungen", "Pflegeprofil"]);
    expect(planReads()).toEqual([]);
  });

  it("US-BES-19 an address on Umtopfen falls back to Behandlungen while the part is not offered", async () => {
    fakeRepotServer({ plan: { hidden: true } });
    renderCollection("/collection?view=plants&teil=umtopfen");
    await openPflege();
    expect(screen.getByRole("button", { name: "Behandlungen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.queryByRole("region", { name: "Umtopfen" })).toBeNull();
  });

  it("US-BES-19 an address on Umtopfen opens the part when it is offered", async () => {
    fakeRepotServer();
    renderCollection("/collection?view=plants&teil=umtopfen");
    await openPflege();
    expect(screen.getByRole("button", { name: "Umtopfen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(await screen.findByRole("region", { name: "Umtopfen" })).toBeTruthy();
  });

  it("US-BES-19 · P-10 a failed plan read says so and offers a retry, in the part Umtopfen", async () => {
    fakeRepotServer({ planFails: true });
    renderCollection();
    await openPflege();
    await userEvent.click(screen.getByRole("button", { name: "Umtopfen" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Das Umtopfen konnte nicht geladen werden.")).toBeTruthy();
    expect(within(alert).getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});

describe("US-BES-19 the part stays short: the observations are one line and their own layer", () => {
  it("US-BES-19 the observations show on one line and the two actions share one row", async () => {
    fakeRepotServer();
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Beobachtungen: keine")).toBeTruthy();
    const umgetopft = section.getByRole("button", { name: "Umgetopft" });
    const notieren = section.getByRole("button", { name: "Beobachtungen notieren" });
    expect(umgetopft.parentElement).toBe(notieren.parentElement);
    expect(umgetopft.parentElement?.className).toContain("flex-wrap");
  });

  it("US-BES-19 the ticked observations are named on the line of the part, in the order of the plan", async () => {
    fakeRepotServer({
      plan: {
        hints: [
          { reason: "roots_out", tickedOn: "2026-11-02", source: "keeper_observation" },
          { reason: "tips_over", tickedOn: "2026-11-02", source: "keeper_observation" },
        ],
      },
    });
    renderCollection();
    const section = within((await openPlan()) as HTMLElement);
    expect(section.getByText("Beobachtungen: Wurzeln aus dem Topf, Pflanze kippt")).toBeTruthy();
  });

  it("US-BES-19 the layer Beobachtungen holds the three observations with their hint, and opens from the part", async () => {
    fakeRepotServer();
    renderCollection();
    const dialog = await openSigns((await openPlan()) as HTMLElement);
    expect(within(dialog).getByRole("group", { name: "Was fällt dir auf?" })).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Hake an, was du siehst. Nach dem Umtopfen sind die Haken wieder leer.",
      ),
    ).toBeTruthy();
    for (const label of ["Wurzeln aus dem Topf", "Erde trocknet zu schnell", "Pflanze kippt"])
      expect(within(dialog).getByRole("checkbox", { name: label })).toBeTruthy();
  });
});

describe("US-BES-19 the keeper ticks what they see in the layer and the hint follows", () => {
  it("US-BES-19 ticking an observation in its layer sends its sign and the switch, and the layer keeps it ticked", async () => {
    const sent = fakeRepotServer();
    renderCollection();
    const dialog = await openSigns((await openPlan()) as HTMLElement);
    const box = within(dialog).getByRole("checkbox", {
      name: "Erde trocknet zu schnell",
    }) as HTMLInputElement;
    await userEvent.click(box);
    await waitFor(() => expect(box.checked).toBe(true));
    expect(posts(sent)).toEqual([
      {
        path: "/specimens/e1/repot-signs",
        body: { sign: "dries_fast", ticked: true, timeZone: expect.any(String) },
      },
    ]);
  });

  it("US-BES-19 clearing a ticked observation in its layer sends ticked false and unticks it", async () => {
    const sent = fakeRepotServer({
      plan: {
        hints: [{ reason: "tips_over", tickedOn: "2026-11-02", source: "keeper_observation" }],
      },
    });
    renderCollection();
    const dialog = await openSigns((await openPlan()) as HTMLElement);
    const box = within(dialog).getByRole("checkbox", { name: "Pflanze kippt" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    await userEvent.click(box);
    await waitFor(() => expect(box.checked).toBe(false));
    expect(posts(sent)[0]?.body).toEqual({
      sign: "tips_over",
      ticked: false,
      timeZone: expect.any(String),
    });
  });

  it("US-BES-19 · P-10 a refused tick shows the German text of its code, never the server text", async () => {
    fakeRepotServer({
      signRefusal: {
        status: 400,
        body: { error: { code: "input.invalid", text: "Roher Serverkram" } },
      },
    });
    renderCollection();
    const dialog = await openSigns((await openPlan()) as HTMLElement);
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Wurzeln aus dem Topf" }));
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText("Die Eingabe ist ungültig. Bitte prüfe die markierten Felder."),
    ).toBeTruthy();
    expect(screen.queryByText("Roher Serverkram")).toBeNull();
  });
});
