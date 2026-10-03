import { describe, expect, it } from "vitest";
import { heuteLokal, istZeitzone } from "./datum";

// NFR-08, QG-D4, FR-BES-04 (Prototyp-Fehler B-01): Kalenderdaten sind lokale Daten des Nutzers, nie das UTC-Datum.
describe("US-BES-02 Gefangen_Am: heutiges lokales Datum (NFR-08, FR-BES-04)", () => {
  const nachtInUtc = new Date("2026-10-02T23:30:00Z");

  it("derselbe Zeitpunkt ergibt je nach Zeitzone ein anderes lokales Datum", () => {
    expect(heuteLokal(nachtInUtc, "Europe/Berlin")).toBe("2026-10-03");
    expect(heuteLokal(nachtInUtc, "Pacific/Auckland")).toBe("2026-10-03");
    expect(heuteLokal(nachtInUtc, "America/New_York")).toBe("2026-10-02");
    expect(heuteLokal(nachtInUtc, "UTC")).toBe("2026-10-02");
  });

  it("die Zeitumstellung (2026-03-29 in Berlin) verschiebt das Kalenderdatum nicht", () => {
    expect(heuteLokal(new Date("2026-03-28T23:30:00Z"), "Europe/Berlin")).toBe("2026-03-29");
    expect(heuteLokal(new Date("2026-03-29T21:59:00Z"), "Europe/Berlin")).toBe("2026-03-29");
    expect(heuteLokal(new Date("2026-03-29T22:00:00Z"), "Europe/Berlin")).toBe("2026-03-30");
  });

  it("das Datum hat immer die Form JJJJ-MM-TT mit führenden Nullen", () => {
    expect(heuteLokal(new Date("2026-01-05T12:00:00Z"), "Europe/Berlin")).toBe("2026-01-05");
  });

  it("erkennt gültige Zeitzonennamen und lehnt alles andere ab", () => {
    expect(istZeitzone("Europe/Berlin")).toBe(true);
    expect(istZeitzone("UTC")).toBe(true);
    for (const falsch of ["Mars/Olympus", "", "+02:00", "  ", 42, null, undefined])
      expect(istZeitzone(falsch)).toBe(false);
  });
});
