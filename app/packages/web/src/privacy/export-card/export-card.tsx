import { useRef, useState } from "react";
import { Button } from "@/components/ui/button/button";
import { MoreHelp } from "@/components/ui/display/more-help/more-help";
import { LayerPart } from "@/components/shared/responsive/layer-sheet/layer-part/layer-part";
import { errorText } from "@/lib/error-text";
import { SIGN_IN, type ApiError } from "../../kernel";
import { fetchExport, saveFile } from "../privacy-api";

type Token = () => Promise<string | undefined>;

const ALERT =
  "rounded-lg border border-destructive p-3 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The export of all own data (US-ACC-04) as a row of "Meine Daten" that opens its layer (US-QS-15): one tap in the layer
 * prepares the archive and the browser saves it. The line says what the file holds (P-09), the rest is behind "Mehr
 * erfahren"; a photo that is missing from the store is named, never dropped (P-10).
 */
export function ExportCard(props: { api: string; token: Token }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const busy = useRef(false);

  const download = async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    setMessage(null);
    const t = await props.token();
    const r = t ? await fetchExport(props.api, t) : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setRunning(false);
    setError(r.ok ? null : r.error);
    if (!r.ok) return;
    saveFile(r.value.blob, "pflanzendex-export.zip");
    const missing = r.value.missingPhotos;
    setMessage(
      "Das Archiv wurde heruntergeladen. " +
        (missing > 0
          ? `${missing} ${missing === 1 ? "Foto fehlt" : "Fotos fehlen"} im Speicher und ${missing === 1 ? "ist" : "sind"} in der Datei data.json vermerkt.`
          : "Alle deine Fotos sind dabei."),
    );
  };

  return (
    <LayerPart
      id="export"
      title="Meine Daten herunterladen"
      value="ZIP-Archiv mit allen deinen Daten"
      primaryAction={
        <Button type="button" className="w-full" disabled={running} onClick={() => void download()}>
          {running ? "Archiv wird vorbereitet …" : "Daten herunterladen"}
        </Button>
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <MoreHelp more="Du bekommst ein ZIP-Archiv mit allen deinen Daten: Pflanzen, Messungen, Behandlungen, Wünsche, Equipment, Einstellungen, Freigaben, deine Seite der Freundschaften und Tausche sowie die KI-Verbindungen. Die Datei data.json ist ein offenes Format, deine Fotos liegen im Ordner photos. Gleiche Daten ergeben dieselbe Datei. Zugangsdaten für Push-Mitteilungen sind nicht enthalten.">
          Ein ZIP-Archiv mit allen deinen Daten, deine Fotos liegen im Ordner photos.
        </MoreHelp>
        {error && (
          <p role="alert" className={ALERT}>
            {error.code === "network.not_reachable" ? error.text : errorText(error.code)}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-lg border border-border p-3">
            {message}
          </p>
        )}
      </div>
    </LayerPart>
  );
}
