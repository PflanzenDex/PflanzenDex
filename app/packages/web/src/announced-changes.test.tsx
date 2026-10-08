// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpecimenCard } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProposalForm } from "./catalog/proposal/proposal-form/proposal-form";
import { CollectionList } from "./collection/specimens/cards/collection-list/collection-list";

afterEach(cleanup);

const card = (extra: Partial<SpecimenCard> = {}): SpecimenCard => ({
  id: "e1",
  name: "Bogenhanf",
  speciesId: "a1",
  marker: null,
  speciesName: "Bogenhanf",
  status: "plant",
  location: "Regal Süd",
  lightZone: "Zone 3",
  caughtAt: "2026-09-01",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
  ...extra,
});

const list = (cards: SpecimenCard[]) =>
  render(
    <CollectionList
      cards={cards}
      onSpeciesChoose={vi.fn()}
      photoAccess={{ api: "http://api", token: async () => "tok" }}
    />,
  );

describe("US-QS-10 · a form with errors guides to the fix (3.3.1, 3.3.3, DS-38)", () => {
  it("US-QS-10 submitting an empty proposal focuses the first invalid field and every error names the field and the fix", async () => {
    render(<ProposalForm onSend={async () => null} onCancel={vi.fn()} onExisting={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /speichern|vorschlagen|senden/i }));
    const first = screen.getByRole("textbox", { name: /lateinischer Name/i });
    await waitFor(() => expect(document.activeElement).toBe(first));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(1);
    for (const alert of alerts) {
      // Each message starts with what to do ("Bitte gib …", "Bitte wähle …", "Bitte beschreibe …") and names the field.
      expect(alert.textContent).toMatch(/^Bitte (gib|wähle|beschreibe|nenne)/);
      const field = document.getElementById(
        (alert.id ?? "").replace(/-message$/, "-control"),
      ) as HTMLElement | null;
      expect(field?.getAttribute("aria-invalid")).toBe("true");
      expect((field?.getAttribute("aria-describedby") ?? "").split(" ")).toContain(alert.id);
    }
    expect(alerts[0]?.textContent).toBe("Bitte gib den lateinischen Namen an.");
  });
});

describe("US-QS-10 · photos have an alternative text (1.1.1)", () => {
  it("US-QS-10 a specimen photo is described with the name and the date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    URL.createObjectURL = vi.fn(() => "blob:card");
    render(
      <CollectionList
        cards={[
          card({ photo: { url: "/specimens/e1/measurements/m1/photo", date: "2026-09-28" } }),
        ]}
        onSpeciesChoose={vi.fn()}
        photoAccess={{ api: "http://api", token: async () => "tok" }}
      />,
    );
    expect(await screen.findByAltText("Foto von Bogenhanf vom 28.09.2026")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("US-QS-10 without a photo there is no image at all, only text", () => {
    list([card()]);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Noch kein Foto")).toBeTruthy();
  });
});

describe("US-QS-10 · a status is also text (1.4.1, 1.3.3)", () => {
  it("US-QS-10 etiolated growth is a word, not only a colour", () => {
    list([
      card({
        lastMeasurement: { date: "2026-10-01", value: 12.5, quality: "etiolated", note: null },
      }),
    ]);
    const strong = screen.getByText("Vergeilt/dünn");
    expect(strong.textContent).toBe("Vergeilt/dünn");
    expect(within(strong.closest("p") as HTMLElement).getByText("Vergeilt/dünn")).toBeTruthy();
  });

  it("US-QS-10 the status of a specimen is spoken as words (care phase of the specimen: plant, cutting, archived)", () => {
    list([card({ status: "cutting" })]);
    expect(screen.getByText(/Status: Steckling/)).toBeTruthy();
  });
});
