import { darfMitFreundenTeilen } from "@pflanzendex/core";
import { mitKonto } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "../kern";

/** Eigene Kontodaten (FR-ACC-01): E-Mail und Anzeigename kommen aus dem geprüften Token und werden aktuell gehalten. */
export function kontoRouten(pool: Pool): Hono<AuthEnv> {
  const routen = new Hono<AuthEnv>();
  routen.get("/", async (c) => {
    const { id, daten } = c.get("konto");
    await mitKonto(pool, id, (db) =>
      db.query(
        `insert into kontodaten (konto_id, email, anzeigename, email_bestaetigt)
         values ($1, $2, $3, $4)
         on conflict (konto_id) do update
           set email = excluded.email, anzeigename = excluded.anzeigename,
               email_bestaetigt = excluded.email_bestaetigt, aktualisiert_am = now()`,
        [id, daten.email, daten.anzeigename, daten.emailBestaetigt],
      ),
    );
    return c.json({
      id,
      email: daten.email,
      anzeigename: daten.anzeigename,
      emailBestaetigt: daten.emailBestaetigt,
      darfMitFreundenTeilen: darfMitFreundenTeilen(daten),
    });
  });
  return routen;
}
