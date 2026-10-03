import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migriere, mitKonto, oeffnePool } from "../kern/index.ts";
import { artExistiert, legeFixtureArtAn, loescheArt, loescheArtAlsAnwendung } from "../fixtures.ts";
import { StandortePostgres } from "../licht/index.ts";
import { ExemplarePostgres } from "./index.ts";

// US-BES-02, DM-BES-02, P-04: Exemplare je Konto (echte PostgreSQL, `make db-up`).
let pool: Pool;
let exemplare: ExemplarePostgres;
let standorte: StandortePostgres;
const anna = randomUUID();
const ben = randomUUID();
let art = "";
const werte: {
  artId: string;
  name: string;
  kennzeichen: null;
  standortId: null;
  gefangenAm: string;
} = {
  artId: "",
  name: "Bogenhanf",
  kennzeichen: null,
  standortId: null,
  gefangenAm: "2026-10-03",
};

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  art = await legeFixtureArtAn(pool);
  werte.artId = art;
  exemplare = new ExemplarePostgres(pool);
  standorte = new StandortePostgres(pool);
  for (const id of [anna, ben])
    await mitKonto(pool, id, (c) => c.query("insert into konto (id) values ($1)", [id]));
});
afterAll(async () => {
  await pool.query("delete from konto where id = any($1)", [[anna, ben]]);
  await pool.end();
});

const standort = async (konto: string, name: string) => {
  const s = await standorte.anlegen(konto, { name, lichtzoneId: null, art: "innen" });
  if (typeof s === "string") throw new Error(s);
  return s;
};

describe("US-BES-02 Exemplare in der Datenbank", () => {
  it("legt ein Exemplar mit Vorbelegung an und liest es wieder; Status ist Pflanze", async () => {
    const z = await exemplare.anlegen(anna, { ...werte, name: "Anlegen" });
    expect(z).toMatchObject({ name: "Anlegen", artId: art, status: "pflanze", standortId: null });
    expect(typeof z === "object" && (await exemplare.finde(anna, z.id))).toEqual(z);
  });

  it("Gefangen_Am bleibt das gespeicherte Kalenderdatum, unabhängig von Zeitzone des Servers (NFR-08)", async () => {
    const vorher = process.env["TZ"];
    process.env["TZ"] = "Pacific/Kiritimati";
    try {
      const z = await exemplare.anlegen(anna, {
        ...werte,
        name: "Datum",
        gefangenAm: "2026-01-01",
      });
      expect(z).toMatchObject({ gefangenAm: "2026-01-01" });
      const id = typeof z === "object" ? z.id : "";
      expect(await exemplare.finde(anna, id)).toMatchObject({ gefangenAm: "2026-01-01" });
    } finally {
      if (vorher === undefined) delete process.env["TZ"];
      else process.env["TZ"] = vorher;
    }
  });

  it("der Name ist je Konto eindeutig (ohne Beachtung der Schreibweise), bei anderen Konten nicht", async () => {
    await exemplare.anlegen(anna, { ...werte, name: "Eindeutig" });
    expect(await exemplare.anlegen(anna, { ...werte, name: "EINDEUTIG" })).toBe("name_vergeben");
    expect(await exemplare.anlegen(ben, { ...werte, name: "Eindeutig" })).toMatchObject({
      name: "Eindeutig",
    });
  });

  it("ein Standort des eigenen Kontos ist erlaubt, der eines anderen Kontos nicht (Fremdschlüssel (konto_id, id))", async () => {
    const eigen = await standort(anna, "Regal Anna");
    const fremd = await standort(ben, "Regal Ben");
    expect(
      await exemplare.anlegen(anna, { ...werte, name: "Mit Standort", standortId: eigen.id }),
    ).toMatchObject({ standortId: eigen.id });
    expect(
      await exemplare.anlegen(anna, { ...werte, name: "Fremder Standort", standortId: fremd.id }),
    ).toBe("standort_unbekannt");
    expect((await exemplare.liste(anna)).map((z) => z.name)).not.toContain("Fremder Standort");
  });

  it("ein Konto sieht und lädt nur seine eigenen Exemplare (P-04)", async () => {
    const z = await exemplare.anlegen(anna, { ...werte, name: "Nur Anna" });
    const id = typeof z === "object" ? z.id : "";
    expect(await exemplare.finde(ben, id)).toBeNull();
    expect((await exemplare.liste(ben)).map((x) => x.id)).not.toContain(id);
  });

  it("Werte außerhalb der Grenzen und ein unbekannter Status scheitern schon in der Datenbank", async () => {
    await expect(exemplare.anlegen(anna, { ...werte, name: "" })).rejects.toThrow();
    await expect(
      mitKonto(pool, anna, (c) =>
        c.query(
          "insert into exemplar (konto_id, art_id, name, status) values ($1, $2, 'S', 'tot')",
          [anna, art],
        ),
      ),
    ).rejects.toThrow();
  });

  it("US-BES-02, AB-10: der Fremdschlüssel greift, eine unbekannte Art lässt sich nicht eintragen", async () => {
    await expect(
      exemplare.anlegen(anna, { ...werte, name: "Ohne Art", artId: randomUUID() }),
    ).rejects.toMatchObject({ code: "23503", constraint: "exemplar_art" });
    expect((await exemplare.liste(anna)).map((z) => z.name)).not.toContain("Ohne Art");
  });

  it("US-BES-02, AB-10, P-10: eine benutzte Art lässt sich nicht löschen (on delete restrict), auch nicht mit Eigentümerrechten", async () => {
    const z = await exemplare.anlegen(anna, { ...werte, name: "Benutzt" });
    expect(typeof z).toBe("object");
    await expect(loescheArt(pool, art)).rejects.toMatchObject({
      code: "23503",
      constraint: "exemplar_art",
    });
    expect(await artExistiert(pool, art)).toBe(true);
  });

  it("US-BES-02, AB-10: die Anwendungsrolle darf Arten weiterhin nicht löschen", async () => {
    await expect(loescheArtAlsAnwendung(pool, anna, art)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("US-BES-07 Archivieren in der Datenbank", () => {
  const lege = async (konto: string, name: string) => {
    const z = await exemplare.anlegen(konto, { ...werte, name });
    if (typeof z === "string") throw new Error(z);
    return z;
  };

  it("US-BES-07: setzt Status, Datum und Grund; das Datum bleibt das Kalenderdatum (NFR-08)", async () => {
    const vorher = process.env["TZ"];
    process.env["TZ"] = "Pacific/Kiritimati";
    try {
      const z = await lege(anna, "Archiv Datum");
      const r = await exemplare.archivieren(anna, z.id, "eingegangen", "2026-01-01");
      expect(r).toMatchObject({
        status: "archiviert",
        archiviertAm: "2026-01-01",
        archiviertGrund: "eingegangen",
      });
      expect(await exemplare.finde(anna, z.id)).toEqual(r);
    } finally {
      if (vorher === undefined) delete process.env["TZ"];
      else process.env["TZ"] = vorher;
    }
  });

  it("US-BES-07: ein zweites Archivieren ändert Datum und Grund nicht (P-10)", async () => {
    const z = await lege(anna, "Archiv Zweimal");
    await exemplare.archivieren(anna, z.id, "eingegangen", "2026-10-01");
    expect(await exemplare.archivieren(anna, z.id, "verkauft", "2026-10-03")).toBe(
      "bereits_archiviert",
    );
    expect(await exemplare.finde(anna, z.id)).toMatchObject({
      archiviertAm: "2026-10-01",
      archiviertGrund: "eingegangen",
    });
  });

  it("US-BES-07: Wiederherstellen setzt den vorherigen Status und löscht Datum und Grund", async () => {
    const z = await lege(anna, "Archiv Zurück");
    await mitKonto(pool, anna, (c) =>
      c.query("update exemplar set status = 'steckling' where id = $1", [z.id]),
    );
    await exemplare.archivieren(anna, z.id, "abgegeben", "2026-10-01");
    expect(await exemplare.wiederherstellen(anna, z.id)).toMatchObject({
      status: "steckling",
      archiviertAm: null,
      archiviertGrund: null,
    });
    expect(await exemplare.wiederherstellen(anna, z.id)).toBe("nicht_archiviert");
  });

  it("US-BES-07, P-04: ein anderes Konto kann weder archivieren noch wiederherstellen", async () => {
    const z = await lege(anna, "Archiv Mandant");
    expect(await exemplare.archivieren(ben, z.id, "verkauft", "2026-10-03")).toBe("nicht_gefunden");
    await exemplare.archivieren(anna, z.id, "verkauft", "2026-10-03");
    expect(await exemplare.wiederherstellen(ben, z.id)).toBe("nicht_gefunden");
    expect(await exemplare.finde(anna, z.id)).toMatchObject({ status: "archiviert" });
  });

  it("US-BES-07: Status, Datum und Grund gehören zusammen (die Datenbank erzwingt es)", async () => {
    const z = await lege(anna, "Archiv Check");
    const setze = (sql: string) => mitKonto(pool, anna, (c) => c.query(sql, [z.id]));
    await expect(
      setze("update exemplar set status = 'archiviert' where id = $1"),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      setze("update exemplar set archiviert_grund = 'x' where id = $1"),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("US-BES-07: ein archivierter Name bleibt belegt, das Wiederherstellen kollidiert also nie", async () => {
    const z = await lege(anna, "Archiv Name");
    await exemplare.archivieren(anna, z.id, "verkauft", "2026-10-03");
    expect(await exemplare.anlegen(anna, { ...werte, name: "archiv name" })).toBe("name_vergeben");
  });
});
