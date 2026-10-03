import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findeSchemaVerstoesse, mitKonto, migriere, oeffnePool } from "../kern/index.ts";
import { vergibRolle } from "../fixtures.ts";
import { ArtPostgres, PruefungPostgres } from "./index.ts";
import type { ArtName, ArtWerte } from "./art.ts";

// US-BES-01, FR-BES-02, FR-BES-11, E-02: Artenkatalog mit privaten Vorschlägen (echte PostgreSQL, `make db-up`).
let pool: Pool;
let arten: ArtPostgres;
const [anna, ben, betreiber] = [randomUUID(), randomUUID(), randomUUID()];
const alle = [anna, ben, betreiber];

const werte = (name: string, extra: Partial<ArtWerte> = {}): ArtWerte => ({
  lateinischerName: name,
  gattung: name.split(" ")[0] ?? name,
  epitheton: name.split(" ")[1] ?? null,
  sorte: null,
  deutscherName: null,
  englischerName: null,
  synonyme: [],
  familieDeutsch: null,
  familieLateinisch: null,
  schwierigkeit: 1,
  standardStufe: 2,
  lichtbedarfLux: 15000,
  ruheVon: null,
  ruheBis: null,
  standortHinweis: null,
  wachstumsmass: "hoehe",
  vergeilungAnzeichen: "Triebe werden lang und dünn.",
  giesshinweis: null,
  substrat: null,
  rueckschnitt: null,
  wuchsHacks: null,
  erfolgskriterien: "Kompakter Wuchs.",
  botanischeStory: null,
  quelle: null,
  ...extra,
});
const norm = (s: string) => s.toLowerCase();
const namen = (w: ArtWerte): ArtName[] => [
  { feld: "lateinisch", anzeige: w.lateinischerName, norm: norm(w.lateinischerName) },
  ...(w.deutscherName
    ? [{ feld: "deutsch" as const, anzeige: w.deutscherName, norm: norm(w.deutscherName) }]
    : []),
  ...w.synonyme.map((s) => ({ feld: "synonym" as const, anzeige: s, norm: norm(s) })),
];
// Eindeutige Namen je Lauf, damit wiederholte Läufe sich nicht gegenseitig als Dublette sehen.
const lauf = randomUUID().slice(0, 8);
const name = (basis: string) => `${basis}${lauf}`;

const lege = async (nutzer: string, w: ArtWerte) => {
  const r = await arten.anlegen(nutzer, w, namen(w));
  if (r.art !== "neu") throw new Error("Dublette");
  return r.wert;
};
/** Der Betreiber entscheidet über den Prüfvorgang (TE-08); die Oberfläche dazu folgt mit BES-10. */
async function freigeben(artId: string) {
  // Der Betreiber findet den Vorgang über die Prüfliste (Prüfer lesen alle Vorgänge, nur Metadaten).
  const v = await mitKonto(pool, betreiber, (c) =>
    c.query<{ id: string }>("select id from pruefvorgang where objekt_id = $1", [artId]),
  );
  const r = await new PruefungPostgres(pool).entscheide(
    betreiber,
    v.rows[0]?.id ?? "",
    "geprueft",
    null,
  );
  if (!r) throw new Error("Freigabe fehlgeschlagen");
}

beforeAll(async () => {
  pool = oeffnePool();
  await migriere(pool);
  arten = new ArtPostgres(pool);
  for (const id of alle)
    await mitKonto(pool, id, (c) => c.query("insert into konto (id) values ($1)", [id]));
  await vergibRolle(pool, betreiber, "betreiber");
});
afterAll(async () => {
  await pool.query(
    "delete from art where id in (select objekt_id from pruefvorgang where konto_id = any($1))",
    [alle],
  );
  await pool.query("delete from konto where id = any($1)", [alle]);
  await pool.end();
});

describe("Artenkatalog: Vorschlag ist privat (FR-BES-11, P-04, P-05)", () => {
  it("ein Vorschlag landet im Prüfstatus vorschlag und ist nur für den Ersteller sichtbar", async () => {
    const a = await lege(anna, werte(name("Aloe privata ")));
    expect(a).toMatchObject({ pruefstatus: "vorschlag", erstelltVon: "nutzer", eigener: true });
    expect(await arten.finde(anna, a.id)).toMatchObject({ id: a.id });
    expect(await arten.finde(ben, a.id)).toBeNull();
    expect(await arten.finde(betreiber, a.id)).toBeNull();
    const sicht = (n: string) => arten.suche(n, norm(a.lateinischerName));
    expect(await sicht(anna)).toHaveLength(1);
    expect(await sicht(ben)).toEqual([]);
  });

  it("der Prüfvorgang hängt an der Art und erscheint in der Prüfliste des Erstellers", async () => {
    const a = await lege(anna, werte(name("Aloe liste ")));
    const r = await mitKonto(pool, anna, (c) =>
      c.query("select status, objekt_art from pruefvorgang where objekt_id = $1", [a.id]),
    );
    expect(r.rows).toEqual([{ status: "vorschlag", objekt_art: "art" }]);
    const fremd = await mitKonto(pool, ben, (c) =>
      c.query("select 1 from pruefvorgang where objekt_id = $1", [a.id]),
    );
    expect(fremd.rowCount).toBe(0);
  });

  it("nach der Freigabe sehen alle die Art, gekennzeichnet; den Ersteller erfährt niemand über die Prüfliste", async () => {
    const a = await lege(anna, werte(name("Aloe frei ")));
    await freigeben(a.id);
    expect(await arten.finde(ben, a.id)).toMatchObject({ pruefstatus: "geprueft", eigener: false });
    expect(await arten.finde(anna, a.id)).toMatchObject({ eigener: true });
    const meta = await mitKonto(pool, ben, (c) =>
      c.query("select 1 from pruefvorgang where objekt_id = $1", [a.id]),
    );
    expect(meta.rowCount).toBe(0);
  });

  it("auch ein Betreiber sieht den privaten Vorschlag eines anderen nicht (Freigabe-Ansicht folgt mit BES-10)", async () => {
    const a = await lege(anna, werte(name("Aloe betreiber ")));
    expect(await arten.finde(betreiber, a.id)).toBeNull();
  });
});

describe("Artenkatalog: Zeilenregeln und Auslöser in der Datenbank", () => {
  it("Art und Namen haben erzwungene Zeilenregeln; die Anwendung kann sie nicht ändern oder löschen", async () => {
    const r = await pool.query(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
        where relname in ('art', 'art_name') order by relname`,
    );
    expect(r.rows).toEqual([
      { relname: "art", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "art_name", relrowsecurity: true, relforcerowsecurity: true },
    ]);
    const a = await lege(anna, werte(name("Aloe fest ")));
    const aendern = await mitKonto(pool, anna, (c) =>
      c.query("update art set schwierigkeit = 3 where id = $1", [a.id]).catch((e: Error) => e),
    );
    expect(aendern).toBeInstanceOf(Error);
    await expect(
      mitKonto(pool, anna, (c) => c.query("delete from art where id = $1", [a.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it("der Schematest meldet, wenn eine Katalogtabelle ihre Zeilenregel verliert (Ausnahme ohne Konto-Kennung nur mit Regel)", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("alter table art no force row level security");
      expect(await findeSchemaVerstoesse(client)).toEqual([
        expect.stringContaining("Katalogtabelle art:"),
      ]);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("eine Art ohne eigenen Prüfvorgang lässt sich nicht anlegen (weder ohne noch mit fremdem)", async () => {
    const fremd = await lege(anna, werte(name("Aloe fremd ")));
    const einfuegen = (id: string) =>
      mitKonto(pool, ben, (c) =>
        c.query(
          `insert into art (id, gattung, lateinischer_name, schwierigkeit, standard_stufe, lichtbedarf_lux,
             wachstumsmass, vergeilung_anzeichen, erfolgskriterien, erstellt_von)
           values ($1, 'X', 'X', 1, 2, 100, 'hoehe', 'v', 'e', 'nutzer')`,
          [id],
        ),
      );
    await expect(einfuegen(randomUUID())).rejects.toThrow();
    await expect(einfuegen(fremd.id)).rejects.toThrow();
  });

  it("ein Nutzer kann sich nicht als Betreiber oder Prüfer ausgeben (erstellt_von)", async () => {
    const id = randomUUID();
    const w = werte(name("Aloe falsch "));
    await expect(
      mitKonto(pool, ben, async (c) => {
        await c.query(
          "insert into pruefvorgang (konto_id, objekt_art, objekt_id, status) values ($1, 'art', $2, 'vorschlag')",
          [ben, id],
        );
        await c.query(
          `insert into art (id, gattung, lateinischer_name, schwierigkeit, standard_stufe, lichtbedarf_lux,
             wachstumsmass, vergeilung_anzeichen, erfolgskriterien, erstellt_von)
           values ($1, 'X', $2, 1, 2, 100, 'hoehe', 'v', 'e', 'betreiber')`,
          [id, w.lateinischerName],
        );
      }),
    ).rejects.toThrow(/Betreiber|Prüfer/);
  });

  it("Pflichtfelder und Wertebereiche gelten auch ohne die Operationen (Schwierigkeit, Stufe, Ruhephase als Paar)", async () => {
    for (const w of [
      werte(name("Aloe a "), { schwierigkeit: 4 }),
      werte(name("Aloe b "), { standardStufe: 1 }),
      werte(name("Aloe c "), { ruheVon: "11-15" }),
      werte(name("Aloe d "), { wachstumsmass: "gewicht" as ArtWerte["wachstumsmass"] }),
    ])
      await expect(arten.anlegen(anna, w, namen(w))).rejects.toThrow();
  });

  it("scheitert das Anlegen, bleibt nichts zurück (kein Teilzustand, FR-BES-03)", async () => {
    const w = werte(name("Aloe teil "), { schwierigkeit: 9 });
    const vorher = await pool.query(
      "select count(*)::int as n from pruefvorgang where konto_id = $1",
      [anna],
    );
    await expect(arten.anlegen(anna, w, namen(w))).rejects.toThrow();
    const nachher = await pool.query(
      "select count(*)::int as n from pruefvorgang where konto_id = $1",
      [anna],
    );
    expect(nachher.rows[0].n).toBe(vorher.rows[0].n);
  });
});

describe("Artenkatalog: Suche und Dubletten", () => {
  it("findet über lateinischen, deutschen Namen und Synonym und nennt den Treffer (Sansevieria -> Dracaena)", async () => {
    const w = werte(name("Dracaena trifasciata "), {
      deutscherName: name("Bogenhanf "),
      synonyme: [name("Sansevieria trifasciata ")],
    });
    const a = await lege(anna, w);
    await freigeben(a.id);
    const t = async (s: string) => (await arten.suche(ben, norm(s)))[0]?.treffer;
    expect(await t(w.lateinischerName)).toMatchObject({ feld: "lateinisch" });
    expect(await t(name("bogenhanf "))).toMatchObject({ feld: "deutsch" });
    expect(await t(name("sansevieria trifasciata "))).toMatchObject({
      feld: "synonym",
      anzeige: name("Sansevieria trifasciata "),
    });
    expect((await arten.suche(ben, norm(name("sansevieria trifasciata "))))[0]?.synonyme).toEqual([
      name("Sansevieria trifasciata "),
    ]);
  });

  it("verweist bei gleichem Namen oder Synonym auf die sichtbare Art und schreibt nichts", async () => {
    const a = await lege(anna, werte(name("Ficus pumila "), { synonyme: [name("Ficus repens ")] }));
    const gleich = werte(name("Ficus pumila "));
    expect(await arten.anlegen(anna, gleich, namen(gleich))).toMatchObject({
      art: "dublette",
      wert: { id: a.id },
    });
    const ueberSynonym = werte(name("Ficus repens "));
    expect((await arten.anlegen(anna, ueberSynonym, namen(ueberSynonym))).art).toBe("dublette");
    // Ein anderer Nutzer sieht den privaten Vorschlag nicht und legt seinen eigenen an (kein Hinweis auf fremde Daten).
    expect((await arten.anlegen(ben, gleich, namen(gleich))).art).toBe("neu");
  });

  it("Suchzeichen % und _ sind Text, kein Platzhalter; leere Suche listet nur Sichtbares", async () => {
    expect(await arten.suche(ben, "%")).toEqual([]);
    const alles = await arten.suche(ben, null);
    expect(alles.every((x) => x.eigener || x.pruefstatus === "geprueft")).toBe(true);
  });
});

describe("Artenkatalog und Prüfstatus (TE-08)", () => {
  it("der Prüfer entscheidet über den vorhandenen Vorgang; die Art bleibt unverändert und wird danach für alle sichtbar", async () => {
    const a = await lege(anna, werte(name("Aloe prueft ")));
    const pruefung = new PruefungPostgres(pool);
    const v = await mitKonto(pool, anna, (c) =>
      c.query<{ id: string }>("select id from pruefvorgang where objekt_id = $1", [a.id]),
    );
    const id = v.rows[0]?.id ?? "";
    expect(await pruefung.entscheide(betreiber, id, "geprueft", null)).toMatchObject({
      status: "geprueft",
    });
    expect(await arten.finde(ben, a.id)).toMatchObject({
      pruefstatus: "geprueft",
      lateinischerName: a.lateinischerName,
    });
  });
});
