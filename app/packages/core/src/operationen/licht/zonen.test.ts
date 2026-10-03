import { beforeEach, describe, expect, it } from "vitest";
import { fuehreAus } from "../operation";
import type { Operation } from "../operation";
import { SpeicherImSpeicher } from "../testhilfe";
import {
  lichtzoneAendern,
  lichtzoneAnlegen,
  lichtzoneLoeschen,
  lichtzoneVoreinstellung,
  standortAendern,
  standortEinrichten,
} from "./index";
import { LichtImSpeicher, festeNutzung } from "./testhilfe";

let speicher: LichtImSpeicher;
let idem: SpeicherImSpeicher;
let zaehler = 0;
const anna = { nutzerId: "anna" };
const ben = { nutzerId: "ben" };

const rufe = <E, A>(op: Operation<E, A>, eingabe: unknown, kontext = anna) =>
  fuehreAus(op, { idempotenz: idem }, { kontext, eingabe, idempotenzSchluessel: `k${++zaehler}` });

const anlegen = () => lichtzoneAnlegen(speicher.zonenAdapter());
const loeschen = (extra = festeNutzung([])) =>
  lichtzoneLoeschen(speicher.zonenAdapter(), [speicher.standortNutzung(), extra]);

beforeEach(() => {
  speicher = new LichtImSpeicher();
  idem = new SpeicherImSpeicher();
});

describe("US-LIC-05 Lichtzone anlegen und ändern", () => {
  it("legt eine Zone mit Name, Lux-Decke, optionalem PPFD und Reihenfolge an", async () => {
    const r = await rufe(anlegen(), {
      name: " Regal oben ",
      luxDecke: 15000,
      ppfd: 300,
      reihenfolge: 2,
    });
    expect(r.ok && r.wert).toMatchObject({
      name: "Regal oben",
      luxDecke: 15000,
      ppfd: 300,
      reihenfolge: 2,
    });
  });

  it("PPFD und Reihenfolge sind optional; die Reihenfolge hängt dann hinten an", async () => {
    await rufe(anlegen(), { name: "A", luxDecke: 1500, reihenfolge: 5 });
    const r = await rufe(anlegen(), { name: "B", luxDecke: 3000 });
    expect(r.ok && r.wert).toMatchObject({ ppfd: null, reihenfolge: 6 });
  });

  it.each([
    [{ name: "", luxDecke: 100 }, "name"],
    [{ name: "A", luxDecke: 0 }, "luxDecke"],
    [{ name: "A", luxDecke: 1.5 }, "luxDecke"],
    [{ name: "A", luxDecke: "viel" }, "luxDecke"],
    [{ name: "A", luxDecke: 100, ppfd: -3 }, "ppfd"],
    [{ name: "A", luxDecke: 100, reihenfolge: 1.2 }, "reihenfolge"],
  ])("lehnt %j ab und schreibt nichts (Feld %s)", async (eingabe, feld) => {
    const r = await rufe(anlegen(), eingabe);
    expect(!r.ok && r.fehler.details?.map((d) => d.feld)).toEqual([feld]);
    expect(speicher.zonen).toHaveLength(0);
  });

  it("der Name ist je Konto eindeutig, bei anderen Konten darf er wieder vorkommen (P-04)", async () => {
    await rufe(anlegen(), { name: "Lampe 2", luxDecke: 15000 });
    const doppelt = await rufe(anlegen(), { name: "lampe 2", luxDecke: 1 });
    expect(!doppelt.ok && doppelt.fehler.code).toBe("lichtzone.name_vergeben");
    expect((await rufe(anlegen(), { name: "Lampe 2", luxDecke: 1 }, ben)).ok).toBe(true);
  });

  it("ändert Werte und benennt um, ohne dass die Kennung wechselt", async () => {
    const neu = await rufe(anlegen(), { name: "Lampe 2", luxDecke: 15000 });
    if (!neu.ok) throw new Error("Anlegen fehlgeschlagen");
    const r = await rufe(lichtzoneAendern(speicher.zonenAdapter()), {
      id: neu.wert.id,
      name: "Unterholz",
      luxDecke: 12000,
      ppfd: 250,
    });
    expect(r.ok && r.wert).toMatchObject({
      id: neu.wert.id,
      name: "Unterholz",
      luxDecke: 12000,
      ppfd: 250,
    });
    expect(speicher.zonen).toHaveLength(1);
  });

  it("eine fremde oder unbekannte Zone lässt sich nicht ändern", async () => {
    const neu = await rufe(anlegen(), { name: "Lampe 2", luxDecke: 15000 });
    if (!neu.ok) throw new Error("Anlegen fehlgeschlagen");
    const r = await rufe(
      lichtzoneAendern(speicher.zonenAdapter()),
      { id: neu.wert.id, name: "Mein", luxDecke: 1 },
      ben,
    );
    expect(!r.ok && r.fehler.code).toBe("lichtzone.nicht_gefunden");
    expect(speicher.zonen[0]?.name).toBe("Lampe 2");
  });
});

describe("US-LIC-05 Lichtzone löschen: keine stille Löschung (P-10)", () => {
  const zone = async () => {
    const r = await rufe(anlegen(), { name: "Lampe 3", luxDecke: 100000 });
    if (!r.ok) throw new Error("Anlegen fehlgeschlagen");
    return r.wert;
  };

  it("löscht eine ungenutzte Zone", async () => {
    const z = await zone();
    const r = await rufe(loeschen(), { id: z.id });
    expect(r.ok).toBe(true);
    expect(speicher.zonen).toHaveLength(0);
  });

  it("lehnt ab, wenn Standorte die Zone nutzen, und nennt sie", async () => {
    const z = await zone();
    await rufe(standortEinrichten(speicher.standortAdapter()), {
      name: "Regal",
      lichtzoneId: z.id,
      art: "innen",
    });
    const r = await rufe(loeschen(), { id: z.id });
    expect(!r.ok && r.fehler.code).toBe("lichtzone.in_benutzung");
    expect(!r.ok && r.fehler.daten).toEqual([
      { art: "standort", id: expect.any(String), name: "Regal" },
    ]);
    expect(speicher.zonen).toHaveLength(1);
  });

  it("lehnt ab, wenn Exemplare oder Arten die Zone nutzen, und nennt alle (Mechanismus über den Port)", async () => {
    const z = await zone();
    const nutzer = [
      { art: "exemplar", id: "e1", name: "Monstera Nr. 1" },
      { art: "art", id: "a1", name: "Echinopsis" },
    ] as const;
    const r = await rufe(loeschen(festeNutzung(nutzer)), { id: z.id });
    expect(!r.ok && r.fehler.code).toBe("lichtzone.in_benutzung");
    expect(!r.ok && r.fehler.daten).toEqual(nutzer);
    expect(speicher.zonen).toHaveLength(1);
  });

  it("meldet auch den Rückfall des Adapters (neu entstandene Nutzung) als in_benutzung", async () => {
    const z = await zone();
    const adapter = { ...speicher.zonenAdapter(), loeschen: async () => "in_benutzung" as const };
    const r = await rufe(lichtzoneLoeschen(adapter, []), { id: z.id });
    expect(!r.ok && r.fehler.code).toBe("lichtzone.in_benutzung");
  });

  it("eine unbekannte Zone: nicht gefunden", async () => {
    const r = await rufe(loeschen(), { id: "00000000-0000-4000-8000-0000000000ff" });
    expect(!r.ok && r.fehler.code).toBe("lichtzone.nicht_gefunden");
  });
});

describe("US-LIC-05 Voreinstellung (FR-LIC-01)", () => {
  it("legt für ein Konto ohne Zonen die vier Lampen der Spezifikation an", async () => {
    const r = await rufe(lichtzoneVoreinstellung(speicher.zonenAdapter()), {});
    expect(r.ok && r.wert.map((z) => [z.name, z.luxDecke, z.ppfd, z.reihenfolge])).toEqual([
      ["Lampe 1", 1500, 36, 1],
      ["Lampe 2", 15000, 300, 2],
      ["Lampe 3", 100000, 1600, 3],
      ["Lampe 4", 110000, 2000, 4],
    ]);
  });

  it("lehnt ab, wenn das Konto schon Zonen hat, und ändert nichts", async () => {
    await rufe(anlegen(), { name: "Eigene", luxDecke: 5000 });
    const r = await rufe(lichtzoneVoreinstellung(speicher.zonenAdapter()), {});
    expect(!r.ok && r.fehler.code).toBe("lichtzone.nicht_leer");
    expect(speicher.zonen).toHaveLength(1);
  });
});

describe("US-LIC-05 Umbenennen ändert keine Zuordnung (Kennung statt Text)", () => {
  it("Standort bleibt nach dem Umbenennen der Zone derselben Zone zugeordnet", async () => {
    const z = await rufe(anlegen(), { name: "Lampe 2", luxDecke: 15000 });
    if (!z.ok) throw new Error("Anlegen fehlgeschlagen");
    const s = await rufe(standortEinrichten(speicher.standortAdapter()), {
      name: "Regal",
      lichtzoneId: z.wert.id,
      art: "innen",
    });
    await rufe(lichtzoneAendern(speicher.zonenAdapter()), {
      id: z.wert.id,
      name: "Unterholz",
      luxDecke: 15000,
    });
    expect(s.ok && speicher.standorte[0]?.lichtzoneId).toBe(z.wert.id);
    expect(speicher.standorte[0]).toMatchObject({ name: "Regal", lichtzoneId: z.wert.id });
  });

  it("Standort umbenennen lässt Zone und Art unberührt", async () => {
    const z = await rufe(anlegen(), { name: "Lampe 2", luxDecke: 15000 });
    if (!z.ok) throw new Error("Anlegen fehlgeschlagen");
    const s = await rufe(standortEinrichten(speicher.standortAdapter()), {
      name: "Regal",
      lichtzoneId: z.wert.id,
      art: "aussen",
    });
    if (!s.ok) throw new Error("Anlegen fehlgeschlagen");
    const r = await rufe(standortAendern(speicher.standortAdapter()), {
      id: s.wert.id,
      name: "Balkonregal",
      lichtzoneId: z.wert.id,
      art: "aussen",
    });
    expect(r.ok && r.wert).toMatchObject({
      id: s.wert.id,
      name: "Balkonregal",
      lichtzoneId: z.wert.id,
      art: "aussen",
    });
  });
});
