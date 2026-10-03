import type { ArchivEintrag, ExemplarZeile } from "@pflanzendex/core";
import type { Antwort } from "../kern";

type Abruf = typeof fetch;
const NICHT_UMGESETZT: Antwort<never> = {
  ok: false,
  fehler: { code: "system.unerwartet", text: "Noch nicht umgesetzt." },
};

// Skelett für den roten Nachweis (P-06).
export async function ladeArchiv(
  api: string,
  token: string,
  abruf: Abruf = fetch,
): Promise<Antwort<readonly ArchivEintrag[]>> {
  void [api, token, abruf];
  return NICHT_UMGESETZT;
}

export async function archiviere(
  api: string,
  token: string,
  eingabe: { id: string; grund: string },
  abruf: Abruf = fetch,
): Promise<Antwort<ExemplarZeile>> {
  void [api, token, eingabe, abruf];
  return NICHT_UMGESETZT;
}

export async function stelleWiederHer(
  api: string,
  token: string,
  id: string,
  abruf: Abruf = fetch,
): Promise<Antwort<ExemplarZeile>> {
  void [api, token, id, abruf];
  return NICHT_UMGESETZT;
}
