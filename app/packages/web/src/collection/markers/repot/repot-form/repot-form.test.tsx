// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openPlant } from "../../../specimens/tests/plants-test-helpers";
import {
  fakeRepotServer,
  planReads,
  renderCollection,
  type Post,
} from "../repot-plan/repot-test-helpers/repot-test-helpers";

// US-BES-19: the repot of a plant with its pot, and the cutting's form that stays as it was (US-BES-04), through the menu
// of the plant layer. The fake server answers the plan and records the writes.
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

/** Opens the menu "Mehr" of the open plant and chooses the repot ("Umgetopft" for a plant, "Eingetopft" for a cutting). */
async function chooseRepot(item: "Umgetopft" | "Eingetopft") {
  await openPlant("Bogenhanf");
  const layer = await screen.findByRole("dialog", { name: "Bogenhanf" });
  await userEvent.click(within(layer).getByRole("button", { name: "Mehr" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: item }));
}

/** The writes of the repot of the plant. */
const repots = (all: Post[]) => all.filter((p) => p.path === "/specimens/e1/repot");

async function save() {
  await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
}

describe("US-BES-19 the plant's repot names its pot", () => {
  it("US-BES-19 the menu offers Umgetopft for a plant and the form asks for the day and the pot", async () => {
    fakeRepotServer({ plan: { freePots: [{ id: "p1", name: "Topf A", diameterCm: 14 }] } });
    renderCollection();
    await chooseRepot("Umgetopft");
    const form = await screen.findByRole("form", { name: "Pflanze umtopfen" });
    expect(within(form).getByLabelText("Umgetopft am")).toBeTruthy();
    expect(within(form).getByRole("combobox", { name: "In welchen Topf?" })).toBeTruthy();
  });

  it("US-BES-19 the chosen pot and the day go into the repot of the plant", async () => {
    const sent = fakeRepotServer({
      plan: { freePots: [{ id: "p1", name: "Topf A", diameterCm: 14 }] },
    });
    renderCollection();
    await chooseRepot("Umgetopft");
    const form = await screen.findByRole("form", { name: "Pflanze umtopfen" });
    await userEvent.selectOptions(
      within(form).getByRole("combobox", { name: "In welchen Topf?" }),
      "p1",
    );
    await save();
    await waitFor(() => expect(repots(sent)).toHaveLength(1));
    expect(repots(sent)[0]?.body).toEqual({
      timeZone: expect.any(String),
      date: expect.any(String),
      potId: "p1",
    });
  });

  it("US-BES-19 the recorded pot is preselected, so repotting into it keeps it", async () => {
    const sent = fakeRepotServer({
      plan: {
        currentPot: { id: "p0", name: "Terrakotta", diameterCm: 12 },
        freePots: [{ id: "p1", name: "Topf A", diameterCm: 14 }],
      },
    });
    renderCollection();
    await chooseRepot("Umgetopft");
    const form = await screen.findByRole("form", { name: "Pflanze umtopfen" });
    const select = within(form).getByRole("combobox", {
      name: "In welchen Topf?",
    }) as HTMLSelectElement;
    expect(select.value).toBe("p0");
    await save();
    await waitFor(() => expect(repots(sent)).toHaveLength(1));
    expect(repots(sent)[0]?.body).toMatchObject({ potId: "p0" });
  });

  it("US-BES-19 · P-10 'Kein erfasster Topf' names no pot, so the plant leaves its pot", async () => {
    const sent = fakeRepotServer({
      plan: {
        currentPot: { id: "p0", name: "Terrakotta", diameterCm: 12 },
        freePots: [{ id: "p1", name: "Topf A", diameterCm: 14 }],
      },
    });
    renderCollection();
    await chooseRepot("Umgetopft");
    const form = await screen.findByRole("form", { name: "Pflanze umtopfen" });
    await userEvent.selectOptions(
      within(form).getByRole("combobox", { name: "In welchen Topf?" }),
      "Kein erfasster Topf",
    );
    await save();
    await waitFor(() => expect(repots(sent)).toHaveLength(1));
    expect(repots(sent)[0]?.body).not.toHaveProperty("potId");
  });

  it("US-BES-19 · P-10 a pot that another plant holds is refused with its text in the form", async () => {
    fakeRepotServer({
      plan: { freePots: [{ id: "p1", name: "Topf A", diameterCm: 14 }] },
      repotRefusal: {
        status: 409,
        body: { error: { code: "equipment.pot_taken", text: "Roher Serverkram" } },
      },
    });
    renderCollection();
    await chooseRepot("Umgetopft");
    const form = await screen.findByRole("form", { name: "Pflanze umtopfen" });
    await userEvent.selectOptions(
      within(form).getByRole("combobox", { name: "In welchen Topf?" }),
      "p1",
    );
    await save();
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText(
        "Dieser Topf ist schon mit einer anderen Pflanze belegt. Wähle einen freien Topf; es wurde nichts geändert.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Roher Serverkram")).toBeNull();
    // The plan is read again, so the choice shows what is free now.
    await waitFor(() => expect(planReads().length).toBeGreaterThan(1));
  });

  it("US-BES-19 · P-12 with the equipment switched off no pot is offered and the form says the plant leaves its pot", async () => {
    const sent = fakeRepotServer({
      plan: {
        equipmentOff: true,
        currentPot: { id: "p0", name: "Terrakotta", diameterCm: 12 },
        freePots: [],
      },
    });
    renderCollection();
    await chooseRepot("Umgetopft");
    const form = await screen.findByRole("form", { name: "Pflanze umtopfen" });
    expect(within(form).queryByRole("combobox", { name: "In welchen Topf?" })).toBeNull();
    expect(
      within(form).getByText(
        "Ohne Topfauswahl kommt die Pflanze aus einem eingetragenen Topf heraus; der Topf selbst bleibt erhalten.",
      ),
    ).toBeTruthy();
    await save();
    await waitFor(() => expect(repots(sent)).toHaveLength(1));
    expect(repots(sent)[0]?.body).not.toHaveProperty("potId");
  });
});

describe("US-BES-04 the cutting keeps its form", () => {
  it("US-BES-04 the menu offers Eingetopft for a cutting, and its form has no pot and sends none", async () => {
    const sent = fakeRepotServer({ card: { status: "cutting" } });
    renderCollection();
    await chooseRepot("Eingetopft");
    const form = await screen.findByRole("form", { name: "Steckling eintopfen" });
    expect(within(form).getByLabelText("Eingetopft am")).toBeTruthy();
    expect(within(form).queryByRole("combobox", { name: "In welchen Topf?" })).toBeNull();
    await save();
    await waitFor(() => expect(repots(sent)).toHaveLength(1));
    expect(repots(sent)[0]?.body).not.toHaveProperty("potId");
    expect(planReads()).toEqual([]);
  });
});
