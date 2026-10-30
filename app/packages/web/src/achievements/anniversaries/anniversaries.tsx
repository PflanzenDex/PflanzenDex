import { useCallback } from "react";
import { Button } from "@/components/ui/button/button";
import { dateText } from "@/lib/format";
import { useStoredPhoto } from "@/lib/use-stored-photo";
import { useRequest } from "../../kernel";
import {
  loadAnniversaries,
  type AnniversaryItem,
  type AnniversaryPhoto,
} from "../achievements-api";

type Token = () => Promise<string | undefined>;

/** The time with the plant in words: half years and whole years. */
export function anniversaryText(months: number): string {
  if (months < 12) return "ein halbes Jahr";
  const years = months / 12;
  if (years === 1) return "1 Jahr";
  return `${years.toLocaleString("de-DE")} Jahre`;
}

function Photo(props: { api: string; token: Token; photo: AnniversaryPhoto; label: string }) {
  const state = useStoredPhoto({ api: props.api, token: props.token }, props.photo.url);
  // A photo that cannot be loaded is left out; the anniversary itself does not depend on it.
  if (state === null || typeof state === "object") return null;
  return (
    <figure className="m-0 flex flex-col gap-1">
      <img
        src={state}
        alt={`${props.label} vom ${dateText(props.photo.date)}`}
        className="max-h-40 w-auto max-w-full rounded-lg object-contain"
      />
      <figcaption className="text-sm text-muted-foreground">
        {props.label}, {dateText(props.photo.date)}
      </figcaption>
    </figure>
  );
}

function Entry(props: { api: string; token: Token; item: AnniversaryItem; onOpen: () => void }) {
  const { item } = props;
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-card bg-card p-2 text-card-foreground shadow-elevation-1 [overflow-wrap:anywhere]">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs">
            <span className="font-bold">Jubiläum</span>
            <span className="text-muted-foreground">{` · Seit dem ${dateText(item.caughtOn)}.`}</span>
          </p>
          <p className="m-0 text-sm">{`„${item.name}“ ist ${anniversaryText(item.months)} bei dir.`}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          aria-label={`Zur Sammlung: ${item.name}`}
          onClick={props.onOpen}
        >
          Zur Sammlung
        </Button>
      </div>
      {(item.first || item.latest) && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Fotos</summary>
          <div className="flex flex-wrap gap-3">
            {item.first && (
              <Photo api={props.api} token={props.token} photo={item.first} label="Erstes Foto" />
            )}
            {item.latest && (
              <Photo
                api={props.api}
                token={props.token}
                photo={item.latest}
                label="Neuestes Foto"
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
 * breaks the page. No push and no pressure (FR-ACH-06); the text says what happened, the button what to do next (P-09).
 */
export function Anniversaries(props: { api: string; token: Token; onOpen: () => void }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadAnniversaries(api, t), [api]);
  const r = useRequest({ queryKey: ["achievements", "anniversaries"], token, load });
  const v = r.value;
  if (!v || v.calmMode || !Array.isArray(v.items) || v.items.length === 0) return null;
  return (
    <section aria-label="Jubiläen" className="flex min-w-0 flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {v.items.map((item) => (
          <Entry
            key={`${item.specimenId}:${item.months}`}
            api={api}
            token={token}
            item={item}
            onOpen={props.onOpen}
          />
        ))}
      </ul>
    </section>
  );
}
