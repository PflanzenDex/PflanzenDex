import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODULE_CONFIG as ECHT } from "../../../../modules.config.mjs";
import { findeSchemaVerstoesse, migriere } from "./index.ts";
import { modulVerstoesse, type Fremdschluessel, type ModulRegister } from "./modul-schema.ts";
import { oeffnePool } from "./verbindung.ts";

// Modulgrenzen im Schema (FR-QG-19): Tabellenbesitz (AB-13) und Fremdschlüssel über Modulgrenzen (AB-10).
const REGISTER: ModulRegister = {
  KERN: "kern",
  MODULES: [
    { name: "kern", tables: ["konto"], dependsOn: [] },
    { name: "licht", tables: ["zone"], dependsOn: ["kern"] },
    { name: "bestand", tables: ["topf"], dependsOn: ["kern", "licht"] },
    { name: "pflege", tables: ["gabe"], dependsOn: ["kern", "bestand"] },
  ],
};
const GLOBAL_REG: ModulRegister = {
  KERN: "kern",
  MODULES: [
    { name: "kern", tables: ["konto"], dependsOn: [] },
    { name: "katalog", tables: ["art", "andere"], dependsOn: ["kern"] },
    { name: "bestand", tables: ["topf"], dependsOn: ["kern", "katalog"] },
    { name: "pflege", tables: ["gabe"], dependsOn: ["kern"] },
  ],
  GLOBAL_REFERENCE_TABLES: { art: { owner: "katalog", reason: "gemeinsamer Katalog" } },
};
const fk = (von: string, nach: string, vonSpalten: string[], nachSpalten: string[]) =>
  ({ name: `${von}_fk`, von, nach, vonSpalten, nachSpalten }) satisfies Fremdschluessel;
const einfach = (von: string, nach: string, loeschen = "r") =>
  ({ ...fk(von, nach, ["art_id"], ["id"]), loeschen }) satisfies Fremdschluessel;
const sicher = (von: string, nach: string) =>
  fk(von, nach, ["konto_id", "x_id"], ["konto_id", "id"]);

describe("Modulgrenzen im Schema (FR-QG-19)", () => {
  it("AB-13: eine Tabelle ohne Modul fällt auf", () => {
    const v = modulVerstoesse(["konto", "waise"], [], REGISTER);
    expect(v).toEqual([expect.stringMatching(/^AB-13 Tabelle waise:/)]);
  });

  it("AB-10: Fremdschlüssel innerhalb eines Moduls und auf den Mandantenanker sind frei", () => {
    const anker = fk("zone", "konto", ["konto_id"], ["id"]);
    const intern = fk("zone", "zone", ["a"], ["id"]);
    expect(modulVerstoesse(["zone"], [anker, intern], REGISTER)).toEqual([]);
  });

  it("AB-10: mandantensicher auf eine erlaubte Abhängigkeit ist in Ordnung", () => {
    expect(modulVerstoesse(["topf", "zone"], [sicher("topf", "zone")], REGISTER)).toEqual([]);
  });

  it("AB-10: ohne erlaubte Abhängigkeit scheitert der Fremdschlüssel und nennt die Kante", () => {
    const v = modulVerstoesse(["gabe", "zone"], [sicher("gabe", "zone")], REGISTER);
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*pflege -> licht: keine erlaubte/)]);
  });

  it("AB-10: auch die Gegenrichtung (nach oben) ist ohne Kante verboten", () => {
    const v = modulVerstoesse(["zone", "topf"], [sicher("zone", "topf")], REGISTER);
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*licht -> bestand/)]);
  });

  it("AB-10: über Modulgrenzen nur als (konto_id, id), nicht auf die einfache Kennung", () => {
    const einfach = fk("topf", "zone", ["zone_id"], ["id"]);
    const v = modulVerstoesse(["topf", "zone"], [einfach], REGISTER);
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*bestand -> licht: .*\(konto_id, id\)/)]);
  });
});

describe("AB-10 globale Referenztabellen (ADR 0003 O-2)", () => {
  const tabellen = ["topf", "art", "gabe", "andere"];
  it("AB-10: ein einfacher Verweis auf (id) mit on delete restrict von einem erlaubten Modul ist in Ordnung", () => {
    expect(modulVerstoesse(tabellen, [einfach("topf", "art")], GLOBAL_REG)).toEqual([]);
  });
  it("AB-10: ohne erlaubte Abhängigkeit scheitert auch der Verweis auf eine globale Tabelle", () => {
    const v = modulVerstoesse(tabellen, [einfach("gabe", "art")], GLOBAL_REG);
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*pflege -> katalog: keine erlaubte/)]);
  });
  it("AB-10: eine nicht registrierte Tabelle bekommt die Ausnahme nicht", () => {
    const v = modulVerstoesse(tabellen, [einfach("topf", "andere")], GLOBAL_REG);
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*bestand -> katalog: .*\(konto_id, id\)/)]);
  });
  it("AB-10: ohne Begründung im Register scheitert der Verweis", () => {
    const reg = {
      ...GLOBAL_REG,
      GLOBAL_REFERENCE_TABLES: { art: { owner: "katalog", reason: "" } },
    };
    const v = modulVerstoesse(tabellen, [einfach("topf", "art")], reg);
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*ohne Begründung/)]);
  });
  it("AB-10: ohne on delete restrict scheitert der Verweis", () => {
    for (const regel of ["a", "c", "n"]) {
      const v = modulVerstoesse(tabellen, [einfach("topf", "art", regel)], GLOBAL_REG);
      expect(v).toEqual([expect.stringMatching(/^AB-10 .*nur mit on delete restrict/)]);
    }
  });
  it("AB-10: ein zusammengesetzter Verweis auf die globale Tabelle ist nicht die erlaubte Form", () => {
    const f = { ...fk("topf", "art", ["konto_id", "art_id"], ["konto_id", "id"]), loeschen: "r" };
    expect(modulVerstoesse(tabellen, [f], GLOBAL_REG)).toEqual([
      expect.stringMatching(/^AB-10 .*nur als einfacher Verweis auf \(id\)/),
    ]);
  });
});

describe("Modulgrenzen gegen die echte Datenbank (AB-10, AB-13)", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = oeffnePool();
    await migriere(pool);
  });
  afterAll(() => pool.end());

  const mitTestModulen = (abhaengig: string[]): ModulRegister => ({
    KERN: ECHT.KERN,
    GLOBAL_REFERENCE_TABLES: ECHT.GLOBAL_REFERENCE_TABLES,
    MODULES: [
      ...ECHT.MODULES.map((m) => ({ ...m })),
      { name: "ta", tables: ["zone_t"], dependsOn: ["kern"] },
      { name: "tb", tables: ["topf_t"], dependsOn: ["kern", ...abhaengig] },
    ],
  });
  const zone =
    "create table zone_t (konto_id uuid not null references konto(id), id uuid, unique (konto_id, id))";

  async function imRollback(sql: string[], register: ModulRegister) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const s of sql) await client.query(s);
      return await findeSchemaVerstoesse(client, register);
    } finally {
      await client.query("rollback");
      client.release();
    }
  }
  const topf = (fremd: string) => [
    zone,
    "select mandantenschutz('zone_t')",
    `create table topf_t (konto_id uuid not null references konto(id), zone_id uuid, ${fremd})`,
    "select mandantenschutz('topf_t')",
  ];

  it("AB-13: eine Tabelle ohne Eintrag im Register fällt in der echten Datenbank auf", async () => {
    const v = await imRollback(
      [
        "create table waise_t (konto_id uuid not null references konto(id))",
        "select mandantenschutz('waise_t')",
      ],
      mitTestModulen([]),
    );
    expect(v).toEqual([expect.stringMatching(/^AB-13 Tabelle waise_t:/)]);
  });

  it("AB-10: ein Fremdschlüssel ohne erlaubte Abhängigkeit scheitert", async () => {
    const sql = topf("foreign key (konto_id, zone_id) references zone_t (konto_id, id)");
    const v = await imRollback(sql, mitTestModulen([]));
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*tb -> ta: keine erlaubte/)]);
  });

  it("AB-10: ein einfacher Fremdschlüssel auf eine erlaubte Abhängigkeit scheitert, der mandantensichere nicht", async () => {
    const einfach = topf("foreign key (zone_id) references zone_t (id)").map((s) =>
      s === zone ? zone.replace("unique (konto_id, id)", "unique (id), unique (konto_id, id)") : s,
    );
    const v = await imRollback(einfach, mitTestModulen(["ta"]));
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*tb -> ta: .*\(konto_id, id\)/)]);
    const ok = topf("foreign key (konto_id, zone_id) references zone_t (konto_id, id)");
    expect(await imRollback(ok, mitTestModulen(["ta"]))).toEqual([]);
  });

  it("AB-10: der echte Verweis exemplar.art_id -> art(id) ist als globale Referenz erlaubt, ohne restrict scheitert er", async () => {
    expect(await findeSchemaVerstoesse(pool, mitTestModulen([]))).toEqual([]);
    const v = await imRollback(
      [
        "alter table exemplar drop constraint exemplar_art",
        "alter table exemplar add constraint exemplar_art foreign key (art_id) references art (id) on delete cascade",
      ],
      mitTestModulen([]),
    );
    expect(v).toEqual([expect.stringMatching(/^AB-10 .*exemplar -> art.*on delete restrict/)]);
  });
});
