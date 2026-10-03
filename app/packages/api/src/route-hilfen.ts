import { fuehreAus, type Abhaengigkeiten, type Operation } from "@pflanzendex/core";
import type { Context } from "hono";
import type { AuthEnv } from "./auth/middleware";
import { fehlerKoerper, statusFuer } from "./fehler-http";

export type Ctx = Context<AuthEnv>;

/**
 * Einziger Schreibweg der Routen (P-03): die Operation prüft Eingabe, Zugriff und Wiederholungsschutz
 * (`Idempotency-Key`). Fehler werden mit stabilem Code und Text beantwortet, nie mit der Ursache.
 */
export async function schreibe<E, A>(
  c: Ctx,
  deps: Abhaengigkeiten,
  op: Operation<E, A>,
  eingabe: unknown,
  erfolg: 200 | 201 = 200,
  huelle: (wert: A) => object = (w) => w as object,
) {
  const r = await fuehreAus(op, deps, {
    kontext: { nutzerId: c.get("konto").id },
    eingabe,
    idempotenzSchluessel: c.req.header("idempotency-key") || undefined,
  });
  if (!r.ok) {
    if (r.fehler.code === "system.unerwartet")
      console.error("Operation fehlgeschlagen", r.fehler.ursache);
    return c.json(fehlerKoerper(r.fehler), statusFuer(r.fehler));
  }
  return c.json(huelle(r.wert), erfolg);
}

/** Der JSON-Körper als Objekt; alles andere zählt als leer und scheitert an der Eingabeprüfung. */
export async function koerper(c: Ctx): Promise<Record<string, unknown>> {
  const b: unknown = await c.req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}
