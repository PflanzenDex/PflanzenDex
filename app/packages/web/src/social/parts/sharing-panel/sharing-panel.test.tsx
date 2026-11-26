// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { SharedSpecimen } from "@pflanzendex/core";
import { filledIn, hasOwnBorder, isFilled, isPlain } from "@/shared/ui/button.roles";
import table from "../../social.de.json";
import { SharingPanel, sharingChoice } from "./sharing-panel";

afterEach(cleanup);

describe("US-QS-32 sharing panel copy", () => {
  it("US-QS-32 with no plant it says so in one line and offers Pflanze anlegen", () => {
    render(
      <SharingPanel specimens={[]} shared={[]} busy={false} onSet={vi.fn()} onSetAll={vi.fn()} />,
    );
    expect(screen.getByText("Noch keine Pflanze zum Teilen.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pflanze anlegen" }).getAttribute("href")).toBe(
      "/collection/new",
    );
  });
});

/**
 * The word for every field of the whitelist a friend sees of a shared plant (QG-D2, P-05). A new field in
 * `SharedSpecimen` fails the type check here until its word is in the text. Left out: the id and the photo flag (no
 * photo leaves before US-WAC-05). The repot day reaches friends as the feed event "Eingetopft" (US-SOZ-05).
 */
const FIELD_WORDS: Record<Exclude<keyof SharedSpecimen, "id" | "photoShared">, string> = {
  speciesLatin: "Art",
  speciesGerman: "Art",
  name: "Name",
  caughtAt: "Fangdatum",
  isCutting: "Steckling",
  repottedAt: "eingetopft",
};

describe("US-QS-32 · US-SOZ-04 one list of shared fields, true to the whitelist (F-0256, F-0249)", () => {
  it("US-SOZ-04 the key shared.fields names every whitelisted field and nothing the whitelist leaves out", () => {
    const fields = table["shared.fields"];
    for (const word of Object.values(FIELD_WORDS)) expect(fields).toContain(word);
    expect(fields).not.toMatch(/Anzahl|Standort|Messwert|Behandlung|Preis/);
    expect(table["help.sharing"]).toContain("{fields}");
  });

  it("US-SOZ-04 the question of 'Alle teilen' tells the same list", async () => {
    const specimens = [{ id: "a", speciesId: "s", name: "Aloe – A", status: "plant" as const }];
    render(
      <MemoryRouter>
        <SharingPanel
          specimens={specimens}
          shared={[]}
          busy={false}
          onSet={vi.fn()}
          onSetAll={vi.fn()}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Alle teilen/ }));
    expect(
      screen.getByText(
        `Alle 1 Pflanzen für Freunde freigeben? Freunde sehen dann nur ${table["shared.fields"]}.`,
      ),
    ).toBeTruthy();
  });

  it("US-SOZ-04 the row Was Freunde sehen shows the count in every state, never Alles privat", () => {
    const specimens = [
      { id: "a", speciesId: "s", name: "Aloe – A", status: "plant" as const },
      { id: "b", speciesId: "s", name: "Aloe – B", status: "plant" as const },
    ];
    expect(sharingChoice(specimens, [])).toBe("0 von 2 Pflanzen geteilt");
  });
});

describe("US-QS-32 · SG-BTN-01 the bulk actions of the sharing layer are plain, its question has one filled button", () => {
  const specimens = [{ id: "a", speciesId: "s", name: "Aloe – A", status: "plant" as const }];
  const show = () =>
    render(
      <MemoryRouter>
        <SharingPanel
          specimens={specimens}
          shared={[]}
          busy={false}
          onSet={vi.fn()}
          onSetAll={vi.fn()}
        />
      </MemoryRouter>,
    );

  it("US-QS-32 · SG-BTN-01 'Alle teilen' and 'Alle zurückziehen' are plain buttons without a border", () => {
    show();
    for (const name of ["Alle teilen", "Alle zurückziehen"]) {
      const b = screen.getByRole("button", { name });
      expect(isPlain(b), name).toBe(true);
      expect(hasOwnBorder(b), name).toBe(false);
    }
    expect(filledIn(document.body)).toHaveLength(0);
  });

  it("US-QS-32 · SG-BTN-02 the question holds the one filled 'Alle teilen' and a plain 'Abbrechen'", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Alle teilen" }));
    expect(isFilled(screen.getByRole("button", { name: "Alle teilen" }))).toBe(true);
    expect(isPlain(screen.getByRole("button", { name: "Abbrechen" }))).toBe(true);
    expect(filledIn(document.body)).toHaveLength(1);
  });
});
