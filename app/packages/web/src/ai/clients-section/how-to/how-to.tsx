import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { copyText } from "@/shared/platform/browser/clipboard";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../ai.de.json";

const ui = texts(table);

/** How long the button reads "Adresse kopiert" (about 3 s, F-0301, US-QS-32). */
const COPIED_MS = 3_000;

/**
 * How to connect an AI client: the address of the interface and the steps (US-KI-07). The copy button shows its result in
 * place (F-0301, US-QS-32): "Adresse kopiert" for about 3 s, and the text is announced. A refused copy shows the line
 * under the button as an alert, so the keeper copies the address by hand (P-10).
 */
export function HowTo({ address }: { address: string }) {
  // `ok` of the last try; `null` before any try. A new object per try restarts the timer.
  const [copy, setCopy] = useState<{ ok: boolean } | null>(null);
  const announce = useAnnounce();
  useEffect(() => {
    if (copy?.ok !== true) return;
    const timer = setTimeout(() => setCopy(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copy]);
  const tryCopy = async () => {
    const ok = await copyText(address);
    setCopy({ ok });
    if (ok) announce?.announce(ui("howTo.copiedSaid"));
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <strong>So verbindest du einen KI-Client</strong>
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
        <li>
          {ui("howTo.add")} <code className="break-all">{address}</code>
        </li>
        <li>Melde dich im Fenster des Anmeldedienstes an und bestätige die Anfrage.</li>
        <li>
          Der Client erscheint hier mit dem Recht „Entwürfe“. Höhere Rechte erlaubst du hier
          ausdrücklich.
        </li>
      </ol>
      <p className="m-0 text-sm text-muted-foreground">
        Wichtig: Dein KI-Anbieter erhält die Daten, die dein Client bei PflanzenDéx abruft. Die App
        selbst sendet nichts an einen KI-Dienst. Pro Verbindung gibt es ein Tageslimit an Aufrufen;
        ist es erreicht, funktionieren alle Formulare der App weiter.
      </p>
      <Button variant="secondary" size="sm" className="self-start" onClick={() => void tryCopy()}>
        {copy?.ok ? ui("howTo.copied") : ui("howTo.copy")}
      </Button>
      {copy?.ok === false ? (
        <p role="alert" className="m-0 text-sm text-destructive">
          {ui("howTo.copyFailed")}
        </p>
      ) : null}
    </div>
  );
}
