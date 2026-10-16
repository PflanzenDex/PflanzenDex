import type { AppRarity, CollectorCard as Card } from "@pflanzendex/core";

type Rarity = Card["natureRarity"];

const CATEGORY_TEXT = {
  LC: "nicht gefährdet",
  NT: "potenziell gefährdet",
  VU: "gefährdet",
  EN: "stark gefährdet",
  CR: "vom Aussterben bedroht",
  EW: "in der Natur ausgestorben",
  EX: "ausgestorben",
  DD: "Datenlage unzureichend",
} as const;

// "2026-10-16T10:00:00.000Z" becomes "16.10.2026": the day of the retrieval, not a calendar date of the keeper.
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/** A source is a link only for https; anything else stays plain text (P-08: the value still names its source). */
function Source(props: { url: string; retrievedAt: string }) {
  const text = `Quelle: GBIF, abgerufen ${day(props.retrievedAt)}`;
  if (!props.url.startsWith("https://"))
    return <span className="text-sm text-muted-foreground">{text}</span>;
  return (
    <a href={props.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
      {text}
    </a>
  );
}

/**
 * Rarity in nature (US-POK-13): IUCN category and GBIF occurrence count, each labelled "in der Natur", with source and
 * retrieval date; unknown says "unbekannt" (P-08). Information only: no sorting, badge or reward, and the note on a
 * threatened species neither blocks nor promotes anything.
 */
export function RarityNote(props: { rarity: Rarity }) {
  const { iucn, occurrences, threatened } = props.rarity;
  return (
    <>
      <span className="text-sm">
        {iucn === null
          ? "In der Natur: Gefährdung unbekannt"
          : `In der Natur: ${CATEGORY_TEXT[iucn.category]} (${iucn.category})`}
      </span>
      {iucn !== null && <Source url={iucn.url} retrievedAt={iucn.retrievedAt} />}
      <span className="text-sm">
        {occurrences === null
          ? "In der Natur: Fundmeldungen unbekannt"
          : `In der Natur: ${occurrences.count.toLocaleString("de-DE")} Fundmeldungen (GBIF)`}
      </span>
      {occurrences !== null && (
        <Source url={occurrences.url} retrievedAt={occurrences.retrievedAt} />
      )}
      {threatened && (
        <span className="text-sm text-muted-foreground">
          Hinweis: Diese Art gilt in der Natur als bedroht.
        </span>
      )}
    </>
  );
}

/** "40 %", but never "0 %" for a species somebody owns and never "100 %" while one account lacks it. */
function percentText(r: AppRarity): string {
  if (r.owners > 0 && r.percent === 0) return "weniger als 1 %";
  if (r.owners < r.participants && r.percent === 100) return "mehr als 99 %";
  return `${r.percent} %`;
}

/**
 * Rarity in PflanzenDex (US-POK-14): the share of the participating accounts that own the species, always with its
 * basis; unknown without participants (P-08). Information only, labelled "in PflanzenDex", never merged with the
 * rarity in nature.
 */
export function AppRarityNote(props: { rarity: AppRarity | null }) {
  const r = props.rarity;
  if (r === null)
    return <span className="text-sm">In PflanzenDex: unbekannt (noch kein Konto nimmt teil)</span>;
  const accounts = r.participants === 1 ? "Konto" : "Konten";
  return (
    <span className="text-sm">{`In PflanzenDex: ${percentText(r)} (${r.owners} von ${r.participants} ${accounts})`}</span>
  );
}
