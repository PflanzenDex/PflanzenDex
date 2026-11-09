import { useCallback, useState } from "react";
import { Button } from "@/shared/ui/button/button";
import { LayerPart } from "@/shared/patterns/responsive/layer-sheet/layer-part/layer-part";
import { dateText, valueText } from "@/shared/lib/format";
import { useStoredPhoto } from "@/shared/platform/browser/use-stored-photo";
import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { useRequest } from "../../shared/data";
import { loadYear, type YearAnswer, type YearPhoto } from "./year-api";
import table from "./year-in-review.de.json";

const t = texts(table);
type Token = () => Promise<string | undefined>;

/** One counted fact per row, with the basis it is counted from (P-08): nothing is rated or compared (FR-ACH-04). */
const FACTS = [
  ["speciesCaught", "fact.speciesCaught", "basis.speciesCaught"],
  ["cuttingsRooted", "fact.cuttingsRooted", "basis.cuttingsRooted"],
  ["treatmentsCompleted", "fact.treatmentsCompleted", "basis.treatmentsCompleted"],
  ["measurements", "fact.measurements", "basis.measurements"],
  ["handovers", "fact.handovers", "basis.handovers"],
  ["achievementsEarned", "fact.achievementsEarned", "basis.achievementsEarned"],
] as const;

function Photo(props: { api: string; token: Token; url: string; photo: YearPhoto; label: string }) {
  const state = useStoredPhoto({ api: props.api, token: props.token }, props.url);
  // A photo that cannot be loaded is left out; the facts do not depend on it.
  if (state === null || typeof state === "object") return null;
  return (
    <figure className="m-0 flex flex-col gap-1">
      <img
        src={state}
        alt={t("photoAlt", { label: props.label, date: dateText(props.photo.date) })}
        className="max-h-32 w-auto max-w-full rounded-lg object-contain"
      />
      <figcaption className="text-sm text-muted-foreground">
        {t("photoCaption", { label: props.label, date: dateText(props.photo.date) })}
      </figcaption>
    </figure>
  );
}

type Year = Extract<YearAnswer, { calmMode: false }>;

function Facts({ v }: { v: Year }) {
  if (!v.hasData) {
    return <p className="m-0 text-sm text-muted-foreground">{t("noData", { year: v.year })}</p>;
  }
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {FACTS.map(([key, label, basis]) => (
          <li key={key}>
            <span className="font-bold tabular-nums">{v.counts[key]}</span> {t(label)}{" "}
            <span className="text-sm text-muted-foreground">({t(basis)})</span>
          </li>
        ))}
      </ul>
      <p className="m-0">
        {v.growth ? (
          <>
            {t("growth", {
              name: v.growth.name,
              growth: valueText(v.growth.growth),
              from: dateText(v.growth.from),
              until: dateText(v.growth.until),
            })}{" "}
            <span className="text-sm text-muted-foreground">{t("growthBasis")}</span>
          </>
        ) : (
          <>
            {t("growthUnknown")}{" "}
            <span className="text-sm text-muted-foreground">{t("growthNeeded")}</span>
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
        label={t("firstPhoto", { name: photos.name })}
      />
      <Photo
        api={api}
        token={token}
        url={photos.urls.last}
        photo={photos.last}
        label={t("lastPhoto", { name: photos.name })}
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
      <DelayedSkeleton>
        <p role="status" className="m-0 text-sm">
          {t("loading")}
        </p>
      </DelayedSkeleton>
    ) : null;
  }
  if (v.calmMode || !v.counts) return null;
  const running = new Date().getFullYear();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* The status sits beside the year, so the buttons below do not move while the other year loads (US-QS-07). */}
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 font-semibold">
        {t("heading", { year: v.year })}
        {r.placeholder && (
          <DelayedSkeleton>
            <span role="status" className="text-sm font-normal text-muted-foreground">
              {t("refreshing")}
            </span>
          </DelayedSkeleton>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setYear(v.year - 1)}>
          {t("previous")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={v.year >= running}
          onClick={() => setYear(v.year + 1 >= running ? null : v.year + 1)}
        >
          {t("next")}
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
    <LayerPart id="year" title={t("title")} value={t("subtitle")}>
      <YearBody api={props.api} token={props.token} />
    </LayerPart>
  );
}
