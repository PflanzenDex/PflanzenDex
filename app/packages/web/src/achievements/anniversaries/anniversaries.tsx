import { useCallback } from "react";
import { dateText } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import { useStoredPhoto } from "@/shared/platform/browser/use-stored-photo";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { plantAddress } from "@/shared/patterns/navigation/navigation/navigation";
import { DisclosureSummary } from "@/shared/ui/more-help.disclosure-summary";
import { useRequest } from "../../shared/data";
import {
  loadAnniversaries,
  type AnniversaryItem,
  type AnniversaryPhoto,
} from "../achievements-api";
import table from "./anniversaries.de.json";

const t = texts(table);

type Token = () => Promise<string | undefined>;

/** The time with the plant in words: half years and whole years. */
export function anniversaryText(months: number): string {
  if (months < 12) return t("time.halfYear");
  const years = months / 12;
  if (years === 1) return t("time.year");
  return t("time.years", { years: years.toLocaleString("de-DE") });
}

function Photo(props: { api: string; token: Token; photo: AnniversaryPhoto; label: string }) {
  const state = useStoredPhoto({ api: props.api, token: props.token }, props.photo.url);
  // A photo that cannot be loaded is left out; the anniversary itself does not depend on it.
  if (state === null || typeof state === "object") return null;
  const date = dateText(props.photo.date);
  return (
    <figure className="m-0 flex flex-col gap-1">
      <img
        src={state}
        alt={t("photo.alt", { label: props.label, date })}
        className="max-h-40 w-auto max-w-full rounded-lg object-contain"
      />
      <figcaption className="text-sm text-muted-foreground">
        {t("photo.caption", { label: props.label, date })}
      </figcaption>
    </figure>
  );
}

/**
 * One anniversary: its row is the plant (US-ACH-06, SG-NAV-04). The whole row is the target and shows a chevron; it opens the
 * plant's layer in the Sammlung, the address the plant rows use (`plantAddress`). The photos stay below it. Archived plants are left out of the anniversaries (core); a plant archived since the list loaded is read by its address like any direct link, so the layer shows the plant or its error, never nothing (FR-BES-23, P-10).
 */
function Entry(props: { api: string; token: Token; item: AnniversaryItem }) {
  const { item } = props;
  return (
    <li className="flex min-w-0 flex-col rounded-card bg-card text-card-foreground shadow-elevation-1 [overflow-wrap:anywhere]">
      <GroupedRow
        bare
        variant="object"
        to={plantAddress(item.specimenId)}
        title={t("entry.sentence", { name: item.name, time: anniversaryText(item.months) })}
        meta={t("entry.meta", { date: dateText(item.caughtOn) })}
      />
      {(item.first || item.latest) && (
        <details className="px-2 pb-2">
          <DisclosureSummary className="py-2 text-sm font-semibold">
            {t("photos")}
          </DisclosureSummary>
          <div className="flex flex-wrap gap-3">
            {item.first && (
              <Photo
                api={props.api}
                token={props.token}
                photo={item.first}
                label={t("photo.first")}
              />
            )}
            {item.latest && (
              <Photo
                api={props.api}
                token={props.token}
                photo={item.latest}
                label={t("photo.latest")}
              />
            )}
          </div>
        </details>
      )}
    </li>
  );
}

/**
 * Anniversaries with the plant on the Today list (US-ACH-06): "<Pflanze> ist 1 Jahr bei dir" with the first and the
 * latest photo, if there are any. Derived on the server from the catch date; the entry stays until the end of the
 * week of the anniversary. Calm mode, no anniversary or a read error show nothing (US-ACH-08): a side feature never
 * breaks the page. No push and no pressure (FR-ACH-06); the text says what happened, and the row opens the plant (P-09).
 */
/** The anniversaries of today; the tile and the layer on "Heute" read the same key, so one request serves both (issue 1662). */
export function useAnniversaries(api: string, token: Token) {
  const load = useCallback((t: string) => loadAnniversaries(api, t), [api]);
  return useRequest({ queryKey: ["achievements", "anniversaries"], token, load });
}

export function Anniversaries(props: { api: string; token: Token }) {
  const { api, token } = props;
  const v = useAnniversaries(api, token).value;
  if (!v || v.calmMode || !Array.isArray(v.items) || v.items.length === 0) return null;
  return (
    <section aria-label={t("layer.title")} className="flex min-w-0 flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {v.items.map((item) => (
          <Entry key={`${item.specimenId}:${item.months}`} api={api} token={token} item={item} />
        ))}
      </ul>
    </section>
  );
}
