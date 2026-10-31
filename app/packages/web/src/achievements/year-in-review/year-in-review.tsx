import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button/button";
import { LayerPart } from "@/components/shared/responsive/layer-sheet/layer-part/layer-part";
import { dateText, valueText } from "@/lib/format";
import { useStoredPhoto } from "@/lib/use-stored-photo";
import { useRequest } from "../../kernel";
import { loadYear, type YearAnswer, type YearPhoto } from "./year-api";

type Token = () => Promise<string | undefined>;

/** One counted fact per row, with the basis it is counted from (P-08): nothing is rated or compared (FR-ACH-04). */
const FACTS = [
  ["speciesCaught", "Arten gefangen", "Fangdatum im Jahr"],
  ["cuttingsRooted", "Stecklinge bewurzelt", "Eintopfdatum des Stecklings im Jahr"],
  ["treatmentsCompleted", "Behandlungen abgeschlossen", "letzter erledigter Termin im Jahr"],
  ["measurements", "Messungen erfasst", "Messdatum im Jahr"],
  ["handovers", "Übergaben", "von beiden bestätigt im Jahr"],
  ["achievementsEarned", "Erfolge erreicht", "Datum des Ereignisses im Jahr"],
] as const;

function Photo(props: { api: string; token: Token; url: string; photo: YearPhoto; label: string }) {
  const state = useStoredPhoto({ api: props.api, token: props.token }, props.url);
  // A photo that cannot be loaded is left out; the facts do not depend on it.
  if (state === null || typeof state === "object") return null;
  return (
    <figure className="m-0 flex flex-col gap-1">
      <img
        src={state}
        alt={`${props.label} vom ${dateText(props.photo.date)}`}
        className="max-h-32 w-auto max-w-full rounded-lg object-contain"
      />
      <figcaption className="text-sm text-muted-foreground">
        {props.label}, {dateText(props.photo.date)}
      </figcaption>
    </figure>
  );
}

type Year = Extract<YearAnswer, { calmMode: false }>;

function Facts({ v }: { v: Year }) {
  if (!v.hasData) {
    return (
      <p className="m-0 text-sm text-muted-foreground">
        {`Für ${v.year} liegen noch keine Daten vor. Fange eine Art, miss eine Pflanze oder erledige eine Behandlung, dann füllt sich der Rückblick.`}
      </p>
    );
  }
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {FACTS.map(([key, label, basis]) => (
          <li key={key}>
            <span className="font-bold tabular-nums">{v.counts[key]}</span> {label}{" "}
            <span className="text-sm text-muted-foreground">({basis})</span>
          </li>
        ))}
      </ul>
      <p className="m-0">
        {v.growth ? (
          <>
            {`Größtes gesundes Wachstum: „${v.growth.name}“, ${valueText(v.growth.growth)} zwischen ${dateText(v.growth.from)} und ${dateText(v.growth.until)}.`}{" "}
            <span className="text-sm text-muted-foreground">
              (eigene Messungen mit Qualität „gesund“)
            </span>
          </>
        ) : (
          <>
            Größtes gesundes Wachstum: unbekannt.{" "}
            <span className="text-sm text-muted-foreground">
              Dafür braucht es mindestens zwei gesunde Messungen im Jahr mit etwa 90&nbsp;Tagen
              Abstand.
            </span>
          </>
        )}
      </p>
    </>
  );
}

function Photos(props: { api: string; token: Token; photos: NonNullable<Year["photos"]> }) {
  const { api, token, photos } = props;
  return (
    <div className="flex flex-wrap gap-3">
      <Photo
        api={api}
        token={token}
        url={photos.urls.first}
        photo={photos.first}
        label={`Erstes Foto des Jahres: ${photos.name}`}
      />
      <Photo
        api={api}
        token={token}
        url={photos.urls.last}
        photo={photos.last}
        label={`Letztes Foto des Jahres: ${photos.name}`}
      />
    </div>
  );
}

/** The layer's content: the year is loaded only while the layer is open (US-QS-15). */
function YearBody(props: { api: string; token: Token }) {
  const { api, token } = props;
  const [year, setYear] = useState<number | null>(null);
  const load = useCallback((t: string) => loadYear(api, t, year), [api, year]);
  const r = useRequest({
    queryKey: ["achievements", "year", year],
    token,
    load,
    keepPrevious: true,
  });
  const v = r.value;
  if (!v) {
    return r.status === "pending" ? (
      <p role="status" className="m-0 text-sm">
        Jahresrückblick wird geladen …
      </p>
    ) : null;
  }
  if (v.calmMode || !v.counts) return null;
  const running = new Date().getFullYear();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="m-0 font-semibold">{`Jahresrückblick ${v.year}`}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setYear(v.year - 1)}>
          Vorjahr
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={v.year >= running}
          onClick={() => setYear(v.year + 1 >= running ? null : v.year + 1)}
        >
          Folgejahr
        </Button>
      </div>
      <Facts v={v} />
      {v.photos && <Photos api={api} token={token} photos={v.photos} />}
    </div>
  );
}

/**
 * The year in review (US-ACH-07) as the row "Jahresrückblick" and its layer: counted facts of one calendar year from the
 * own data, each with its basis, the largest healthy growth by the specimen's own rate and the first and last photo of
 * the year. Unknown stays "unbekannt" and says what is needed (P-08); an empty year says what would fill it (P-09). No
 * percentage, no "besser als letztes Jahr", no comparison with others (FR-ACH-04); private, never shared in this epic
 * (P-05). Calm mode, a read error or an unexpected answer show nothing (US-ACH-08).
 */
export function YearInReviewSection(props: { api: string; token: Token }) {
  return (
    <LayerPart id="year" title="Jahresrückblick" value="Zahlen und Fotos aus deinen Daten">
      <YearBody api={props.api} token={props.token} />
    </LayerPart>
  );
}
