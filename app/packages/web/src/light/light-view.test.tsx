import { renderToString as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LightView, type LightActions } from "./light-view";
import type { LightData } from "./light-api";
import { ErrorMessage } from "./message";
import { derivationText } from "./text";

// React separates adjacent text parts with comments in server rendering; for text checks we remove them.
const renderToString = (e: Parameters<typeof render>[0]) => render(e).replaceAll("<!-- -->", "");
const nothing = async () => null;
const actions: LightActions = {
  zoneCreate: nothing,
  zoneUpdate: nothing,
  zoneDelete: nothing,
  defaults: nothing,
  locationCreate: nothing,
  locationUpdate: nothing,
  zoneDerive: async () => ({ ok: true, value: { kind: "unknown", reason: "no_need" } }),
};
const zone = { id: "z1", name: "Lampe 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 };
const empty: LightData = { zones: [], locations: [], hints: [] };
const html = (data: LightData) => renderToString(<LightView data={data} actions={actions} />);

describe("US-LIC-05 view locations and light zones", () => {
  it("empty account: says what to do (P-09), and offers the default", () => {
    const h = html(empty);
    expect(h).toContain("Noch keine Lichtzonen");
    expect(h).toContain("Standard-Lampen übernehmen");
    expect(h).toContain("Noch keine Standorte");
  });

  it("shows zone with lux ceiling, PPFD and order; missing PPFD means unknown (P-08)", () => {
    const h = html({ ...empty, zones: [zone, { ...zone, id: "z2", name: "Lampe 9", ppfd: null }] });
    expect(h).toContain("bis 15.000 Lux");
    expect(h).toContain("PPFD 300 µmol/m²/s");
    expect(h).toContain("PPFD unbekannt");
  });

  it("shows location with zone name and kind (outdoor/indoor)", () => {
    const h = html({
      ...empty,
      zones: [zone],
      locations: [{ id: "s1", name: "Balkon", lightZoneId: "z1", kind: "outdoor" }],
    });
    expect(h).toContain("Balkon");
    expect(h).toContain("Lampe 2 · außen");
  });

  it('location without zone: appears in "Hints" with the next action and offers assigning', () => {
    const h = html({
      zones: [zone],
      locations: [{ id: "s2", name: "Regal", lightZoneId: null, kind: "indoor" }],
      hints: [
        {
          kind: "location_without_zone",
          locationId: "s2",
          text: "Der Standort „Regal“ hat noch keine Lichtzone.",
          nextAction: "Weise dem Standort eine Lichtzone zu.",
        },
      ],
    });
    expect(h).toContain("Hinweise");
    expect(h).toContain("Weise dem Standort eine Lichtzone zu.");
    expect(h).toContain("Keine Lichtzone");
    expect(h).toContain("Lichtzone zuweisen");
  });

  it("without affected locations there is no hints block", () => {
    expect(html({ ...empty, zones: [zone] })).not.toContain('id="hints"');
  });

  it("forms carry visible labels and input aids for numbers", () => {
    const h = html(empty);
    expect(h).toContain("Lux-Decke (Lux)");
    expect(h).toContain('inputMode="numeric"');
    expect(h).toContain("Keine Lichtzone (erscheint in den Hinweisen)");
  });
});

describe("US-LIC-05 error message when deleting a used zone", () => {
  it("names the using locations, specimens and species (P-10)", () => {
    const h = renderToString(
      <ErrorMessage
        error={{
          code: "light_zone.in_use",
          text: "Diese Lichtzone wird noch genutzt und kann nicht gelöscht werden.",
          data: [
            { kind: "location", id: "s1", name: "Regal" },
            { kind: "specimen", id: "e1", name: "Monstera Nr. 1" },
            { kind: "species", id: "a1", name: "Echinopsis" },
          ],
        }}
      />,
    );
    expect(h).toContain('role="alert"');
    expect(h).toContain("Standort: Regal");
    expect(h).toContain("Exemplar: Monstera Nr. 1");
    expect(h).toContain("Art: Echinopsis");
  });

  it("translates complained-about fields into words", () => {
    const h = renderToString(
      <ErrorMessage
        error={{
          code: "input.invalid",
          text: "Die Eingabe ist ungültig.",
          details: [{ field: "luxCeiling", code: "input.invalid" }],
        }}
      />,
    );
    expect(h).toContain("Bitte prüfe: Lux-Decke.");
  });
});

describe("US-LIC-01 Ansicht Zone ermitteln", () => {
  it("offers lux need, default level and the C3 hint and explains why", () => {
    const h = html(empty);
    expect(h).toContain("Zone einer Art ermitteln");
    expect(h).toContain("Lux-Bedarf der Art (Lux)");
    expect(h).toContain("Stufe 4");
    expect(h).toContain("Sonnenliebende C3-Pflanze mit weichem Blatt");
    expect(h).toContain("Stecklingslicht ist nie das Ziel");
  });

  it("US-LIC-01 result texts: zone with reason, unknown with next action (P-08, P-09)", () => {
    const z = { id: "z2", name: "Lampe 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 };
    expect(derivationText({ kind: "zone", zone: z, level: 2, reason: "soft_leaf" })).toEqual({
      title: "Lichtzone: Lampe 2",
      reason: expect.stringContaining("nicht automatisch"),
    });
    const u = derivationText({ kind: "unknown", reason: "no_need" });
    expect(u.title).toBe("Lichtzone: unbekannt");
    expect(u.reason).toContain("Trage ihn im Katalog ein");
  });
});
