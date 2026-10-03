import type { Verteilung } from "@pflanzendex/core";
import type { Antwort } from "../kern";

/** Platzhalter für den roten Test (US-LIC-02). */
export async function ladeVerteilung(
  api: string,
  token: string,
  abruf: typeof fetch = fetch,
): Promise<Antwort<Verteilung>> {
  void [api, token, abruf];
  throw new Error("nicht umgesetzt");
}
