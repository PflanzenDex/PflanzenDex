// @vitest-environment jsdom
import { renderToString as render } from "react-dom/server";
import { cleanup, render as plainRender } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { LightView, type LightActions } from "./light-view";
import { DerivationForm } from "../../zones/derivation-view/derivation-view";
import { LocationForm } from "../../zones/locations-view/locations-view";
import { ZoneForm } from "../../zones/zones-view/zones-view";
import type { LightData } from "../../shared/light-api/light-api";
import { ErrorMessage } from "../../shared/ui/message/message";
import { derivationText } from "../../shared/texts";

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
const zone = { id: "z1", name: "Zone 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 };
const empty: LightData = { zones: [], locations: [], hints: [] };
const overview = { ok: true as const, value: { rows: [] } };
/** The page in the DOM: the layers are portals, which server rendering does not support. */
const html = (data: LightData) => {
  const { container } = plainRender(
    <MemoryRouter>
      <LightView
        data={data}
        actions={actions}
        overview={overview}
        onOpenCollection={() => undefined}
        onRetry={() => undefined}
      />
    </MemoryRouter>,
  );
  // Non-breaking spaces come out as entities; the text checks compare the characters.
  const markup = container.innerHTML.replaceAll("&nbsp;", "\u00a0");
  cleanup();
  return markup;
};

describe("US-LIC-05 view locations and light zones", () => {
  it("empty account: says what to do (P-09), and offers the default", () => {
    const h = html(empty);
    expect(h).toContain("Noch keine Lichtzonen");
    expect(h).toContain("Standard-Zonen übernehmen");
    expect(h).toContain("Noch keine Standorte");
  });

  it("US-QS-19 shows each zone as a compact row with its lux ceiling", () => {
    const h = html({ ...empty, zones: [zone, { ...zone, id: "z2", name: "Zone 9", ppfd: null }] });
    expect(h).toContain("bis 15.000\u00a0Lux");
    expect(h).toContain("Zone 9");
    expect(h).toContain("Lichtzonen (2)");
  });

  it("shows location with zone name and kind (outdoor/indoor)", () => {
    const h = html({
      ...empty,
      zones: [zone],
      locations: [{ id: "s1", name: "Balkon", lightZoneId: "z1", kind: "outdoor" }],
    });
    expect(h).toContain("Balkon");
    expect(h).toContain("Zone 2 · außen");
  });

  it("US-QS-19 location without zone: the notice counts the hints, the layer says what to do (P-09)", () => {
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
    expect(h).toContain("Hinweise (1)");
    expect(h).toContain("Keine Lichtzone");
    expect(h).toContain("Lichthunger und Einstufung");
  });

  it("US-QS-19 without affected locations there is no hints notice", () => {
    expect(html({ ...empty, zones: [zone] })).not.toContain("Hinweise (");
  });

  it("forms carry visible labels and input aids for numbers", () => {
    const h = renderToString(<ZoneForm onSave={nothing} />);
    expect(h).toContain("Lux-Decke (Lux)");
    expect(h).toContain('inputMode="numeric"');
    expect(renderToString(<LocationForm zones={[zone]} onSave={nothing} />)).toContain(
      "Keine Lichtzone (erscheint in den Hinweisen)",
    );
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
            { kind: "care_profile", id: "a2", name: "Bogenhanf" },
          ],
        }}
      />,
    );
    expect(h).toContain('role="alert"');
    expect(h).toContain("Standort: Regal");
    expect(h).toContain("Pflanze: Monstera Nr. 1");
    expect(h).toContain("Art: Echinopsis");
    expect(h).toContain("Pflegeprofil der Art: Bogenhanf"); // US-BES-09: the zone override of a care profile
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

describe("US-LIC-01 view: derive the zone of a species", () => {
  it("offers lux need, default level and the C3 hint and explains why", () => {
    const h = renderToString(<DerivationForm onDerive={actions.zoneDerive} />);
    expect(h).toContain("Lux-Bedarf der Art (Lux)");
    expect(h).toContain("Stufe 4");
    expect(h).toContain("Sonnenliebende C3-Pflanze mit weichem Blatt");
  });

  it("US-LIC-01 the C3 checkbox is the design-system box in one row with its label (#261)", () => {
    const h = renderToString(<DerivationForm onDerive={actions.zoneDerive} />);
    // The label row that holds the soft-leaf checkbox and its text, as the Checkbox primitive renders it.
    const row = h.match(
      /<label class="([^"]*)"><input([^>]*)\/><span>Sonnenliebende C3-Pflanze mit weichem Blatt<\/span><\/label>/,
    );
    expect(row).not.toBeNull();
    const [, rowClass = "", input = ""] = row ?? [];
    // Box and text side by side, vertically centred, the row is the 44 px target (DS-15).
    expect(rowClass.split(" ")).toEqual(expect.arrayContaining(["flex", "items-center"]));
    expect(rowClass).not.toContain("flex-col");
    expect(input).toContain('type="checkbox"');
    const boxClass = input.match(/class="([^"]*)"/)?.[1] ?? "";
    // Normal 20 px box that never shrinks; no field sizing (width, height, padding) from text inputs.
    expect(boxClass.split(" ")).toEqual(expect.arrayContaining(["size-5", "shrink-0"]));
    expect(boxClass).not.toMatch(/(^| )(w-full|h-11|min-h-|px-|py-)/);
    expect(boxClass).not.toContain("!");
  });

  it("US-LIC-01 result texts: zone with reason, unknown with next action (P-08, P-09)", () => {
    const z = { id: "z2", name: "Zone 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 };
    expect(derivationText({ kind: "zone", zone: z, level: 2, reason: "soft_leaf" })).toEqual({
      title: "Lichtzone: Zone 2",
      reason: expect.stringContaining("nicht automatisch"),
    });
    const u = derivationText({ kind: "unknown", reason: "no_need" });
    expect(u.title).toBe("Lichtzone: unbekannt");
    expect(u.reason).toContain("Trage ihn im Katalog ein");
  });
});
