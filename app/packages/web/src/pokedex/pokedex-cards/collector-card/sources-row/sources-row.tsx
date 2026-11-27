import { useId } from "react";
import { ExternalLink } from "lucide-react";
import type { CollectorCard as Card } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../collector-card.de.json";

const t = texts(table);

/** One source of the card: its name, where it leads (`null` = no usable link) and the note after it. */
type Source = { key: string; name: string; url: string | null; note: string | null };

// "2026-10-16T10:00:00.000Z" becomes "16.10.2026": the day of the retrieval, not a calendar date of the keeper.
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/** A source is a link only for https; anything else stays plain text (P-08: the value still names its source). */
const link = (url: string | null): string | null =>
  url !== null && url.startsWith("https://") ? url : null;

/**
 * GBIF stands behind the rarity in nature (US-POK-13). The IUCN category and the occurrence count are two answers of one
 * source, so the card names it once. The date is the older of the two retrievals, so it never claims fresher data than a
 * number on the card has. The address is the one the card carries (the API answer); the species page of GBIF needs the
 * species key, which the card data does not hold.
 */
function gbif(rarity: Card["natureRarity"]): Source | null {
  const rows = [rarity.iucn, rarity.occurrences].flatMap((r) => (r === null ? [] : [r]));
  const oldest = rows.map((r) => r.retrievedAt).sort()[0];
  if (oldest === undefined) return null;
  const url = rows.map((r) => link(r.url)).find((u) => u !== null) ?? null;
  return {
    key: "gbif",
    name: t("sources.gbif"),
    url,
    note: t("sources.retrieved", { date: day(oldest) }),
  };
}

/** Wikipedia stands behind the text of the card (the picture has its credit under it, SG-PHOTO-03). */
function wikipedia(c: Card): Source | null {
  if (c.summary === null) return null;
  const url = link(c.sourceUrl);
  return {
    key: "wikipedia",
    name: t("sources.wikipedia"),
    url,
    note: url === null ? t("sources.noLink") : null,
  };
}

/** The name of a source and the external-link icon; the last word and the icon form one run, so the icon never stands alone on a line. */
function NameWithIcon({ name }: { name: string }) {
  const cut = name.lastIndexOf(" ");
  return (
    <span>
      {name.slice(0, cut + 1)}
      <span className="whitespace-nowrap">
        {name.slice(cut + 1)}
        <ExternalLink aria-hidden="true" className="ml-1 inline size-5 align-text-bottom" />
      </span>
    </span>
  );
}

/**
 * The sources of a collector card, the section "Quellen" of the sheet that "Mehr" opens (US-QS-15, US-QS-32, F-0135,
 * SG-TOUCH-01): its heading, and under it each source once, in secondary text. The row of links and each link are at least
 * 44 px high (`min-h-11`), the link has the lucide external-link icon after its last word, so the icon wraps with the text at
 * large text size. The sources are separated by space, not by a dot: a dot would hang at the end of a line or stand alone once
 * the row wraps. The facts carry no links. Without a source nothing is shown (P-08).
 */
export function SourcesRow({ card }: { card: Card }) {
  const titleId = useId();
  const sources = [gbif(card.natureRarity), wikipedia(card)].flatMap((s) =>
    s === null ? [] : [s],
  );
  if (sources.length === 0) return null;
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="grid min-w-0 gap-1 text-sm text-muted-foreground"
    >
      <h3 id={titleId} className="m-0 text-base font-semibold text-foreground">
        {t("sources.title")}
      </h3>
      <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-3">
        {sources.map((s) => (
          <span key={s.key} className="inline-flex min-w-0 flex-wrap items-center gap-x-2">
            {s.url === null ? (
              <span className="inline-flex min-h-11 items-center">{s.name}</span>
            ) : (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 min-w-11 items-center underline"
              >
                <NameWithIcon name={s.name} />
              </a>
            )}
            {s.note !== null && <span>{s.note}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
