import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mitKonto, migriere, oeffnePool, pruefeMandantentrennung } from "../kern/index.ts";
import {
  FIXTURES,
  lesenDerRollentabelle,
  schreibenInDieRollentabelle,
  vergibRolle,
} from "../fixtures.ts";
import { PruefungPostgres } from "./index.ts";

// TE-08: Rollen und Prüfstatus gegen eine echte PostgreSQL; die Rechte gelten auch ohne die Operationen aus `core`.
let pool: Pool;
let speicher: PruefungPostgres;
const [halter, fremder, betreiber, pruefer] = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
];
const alle = [halter, fremder, betreiber, pruefer];

const vorschlag = () => ({
  objektArt: "art",
  objektId: randomUUID(),
  status: "vorschlag" as const,
});

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  speicher = new PruefungPostgres(pool);
  for (const id of alle)
    await mitKonto(pool, id, (c) => c.query("insert into konto (id) values ($1)", [id]));
  await vergibRolle(pool, betreiber, "betreiber");
  await vergibRolle(pool, pruefer, "pruefer");
});
afterAll(async () => {
  await pool.query("delete from konto where id = any($1)", [alle]);
  await pool.end();
});

describe("Rollen (FR-BES-14)", () => {
  it("jeder sieht nur seine eigenen Rollen", async () => {
    expect(await speicher.rollen(halter)).toEqual([]);
    expect(await speicher.rollen(betreiber)).toEqual(["betreiber"]);
    expect(await speicher.rollen(pruefer)).toEqual(["pruefer"]);
  });

  it("die Anwendung kann Rollen weder lesen noch vergeben (kein Selbstzugriff auf die Tabelle)", async () => {
    await expect(lesenDerRollentabelle(pool, halter)).rejects.toThrow(/permission denied/);
    await expect(schreibenInDieRollentabelle(pool, halter)).rejects.toThrow(/permission denied/);
    expect(await speicher.rollen(halter)).toEqual([]);
  });
});

describe("Prüfstatus: Nutzer können nur vorschlagen", () => {
  it("ein Nutzer legt einen Vorschlag an; ein zweiter für dasselbe Objekt wird als vorhanden gemeldet", async () => {
    const v = vorschlag();
    const r = await speicher.anlegen(halter, v);
    expect(r).toMatchObject({ erstellerId: halter, status: "vorschlag", geprueftVon: null });
    expect(await speicher.anlegen(fremder, v)).toBe("vorhanden");
  });

  it.each(["geprueft", "kuratiert", "zurueckgewiesen"] as const)(
    "ein Nutzer kann nichts als %s anlegen (Datenbank lehnt ab)",
    async (status) => {
      await expect(speicher.anlegen(halter, { ...vorschlag(), status })).rejects.toThrow();
    },
  );

  it("der Ersteller kann den Status seines Vorschlags nicht selbst ändern", async () => {
    const r = await speicher.anlegen(halter, vorschlag());
    const id = typeof r === "string" ? "" : r.id;
    await expect(speicher.entscheide(halter, id, "geprueft", null)).rejects.toThrow(
      /Betreiber oder Prüfer/,
    );
    await expect(
      mitKonto(pool, halter, (c) =>
        c.query("update pruefvorgang set status = 'kuratiert' where id = $1", [id]),
      ),
    ).rejects.toThrow(/Betreiber oder Prüfer/);
    expect((await speicher.finde(halter, id))?.status).toBe("vorschlag");
  });

  it("ein anderer Nutzer sieht den Vorgang nicht", async () => {
    const r = await speicher.anlegen(halter, vorschlag());
    const id = typeof r === "string" ? "" : r.id;
    expect(await speicher.finde(fremder, id)).toBeNull();
    expect(
      await speicher.entscheide(fremder, id, "geprueft", null).catch(() => "abgelehnt"),
    ).not.toMatchObject({ status: "geprueft" });
  });
});

describe("Prüfstatus: nur Betreiber und Prüfer entscheiden", () => {
  it.each([betreiber, pruefer])(
    "Prüfer %s gibt einen fremden Vorschlag frei; der Vermerk stammt aus der Sitzung",
    async (wer) => {
      const r = await speicher.anlegen(halter, vorschlag());
      const id = typeof r === "string" ? "" : r.id;
      const neu = await speicher.entscheide(wer, id, "geprueft", null);
      expect(neu).toMatchObject({ status: "geprueft", geprueftVon: wer, erstellerId: halter });
      expect(await speicher.finde(halter, id)).toMatchObject({ status: "geprueft" });
    },
  );

  it("Zurückweisen braucht einen Grund (Datenbank), und der Ersteller sieht ihn", async () => {
    const r = await speicher.anlegen(halter, vorschlag());
    const id = typeof r === "string" ? "" : r.id;
    await expect(speicher.entscheide(betreiber, id, "zurueckgewiesen", null)).rejects.toThrow();
    await speicher.entscheide(betreiber, id, "zurueckgewiesen", "Quelle fehlt");
    expect(await speicher.finde(halter, id)).toMatchObject({
      status: "zurueckgewiesen",
      grund: "Quelle fehlt",
    });
  });

  it("ein Prüfer kann Zuordnung und Ersteller eines fremden Vorgangs nicht verändern", async () => {
    const r = await speicher.anlegen(halter, vorschlag());
    const id = typeof r === "string" ? "" : r.id;
    for (const sql of ["konto_id = $2", "objekt_id = gen_random_uuid()", "objekt_art = 'andere'"]) {
      await expect(
        mitKonto(pool, betreiber, (c) =>
          c.query(
            `update pruefvorgang set ${sql} where id = $1`,
            sql.includes("$2") ? [id, betreiber] : [id],
          ),
        ),
      ).rejects.toThrow(/unveränderlich/);
    }
  });

  it("ein Betreiber-Batch ist sofort `kuratiert`; ein Nutzer darf das nicht", async () => {
    const r = await speicher.anlegen(betreiber, { ...vorschlag(), status: "kuratiert" });
    expect(r).toMatchObject({ status: "kuratiert", geprueftVon: betreiber });
  });
});

describe("P-04: der Betreiber sieht keine Inhalte anderer Konten", () => {
  it("mit Betreiber-Rolle besteht der generische Mandantentest für jede Tabelle außer der Prüfliste", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    await mitKonto(pool, a, (c) => c.query("insert into konto (id) values ($1)", [a]));
    await vergibRolle(pool, a, "betreiber");
    const probleme = await pruefeMandantentrennung(pool, FIXTURES, a, b);
    // Einzige Ausnahme, bewusst: Prüfer lesen die Prüfliste (Art, Kennung und Status des Objekts, kein Inhalt).
    expect(probleme.filter((p) => !p.startsWith("pruefvorgang:"))).toEqual([]);
    // Lesen und No-op-Update über die Prüfliste sind das Prüferrecht; Umhängen, Löschen und Einschleusen bleiben verboten.
    expect(probleme.every((p) => /^pruefvorgang: (liest Zeilen|ändert \d+ statt)/.test(p))).toBe(
      true,
    );
    expect(probleme).toContain("pruefvorgang: liest Zeilen eines fremden Kontos");
  });

  it("die Prüfliste enthält ausschließlich Metadaten", async () => {
    const spalten = await pool.query(
      "select column_name from information_schema.columns where table_name = 'pruefvorgang' order by 1",
    );
    expect(spalten.rows.map((z) => z.column_name)).toEqual([
      "angelegt_am",
      "geprueft_am",
      "geprueft_von",
      "grund",
      "id",
      "konto_id",
      "objekt_art",
      "objekt_id",
      "status",
    ]);
  });
});
