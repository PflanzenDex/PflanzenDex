import type { Suggestion } from "@pflanzendex/core";
import { WikipediaSource } from "@/pokedex";
import { CardSection } from "@/shared/patterns/display/card/card-more/card-more";
import { texts } from "@/shared/lib/text-rules/texts";
import { AttributeSources, attributeRows } from "../attribute-view/attribute-view";
import table from "../../discover.de.json";

const t = texts(table);

/**
 * The Wikipedia text keeps the language it was stored in. Where that is known, `lang` tells a screen reader to switch the
 * voice (WCAG 3.1.2) and a visible hint names a foreign language; where it is unknown no language is claimed (P-08). The
 * credit of the text stands beside it (the credit of the picture stands under the picture, SG-PHOTO-03).
 */
function Description({ s }: { s: Suggestion }) {
  if (s.summary === null) return <p className="m-0 text-sm">{t("card.noSummary")}</p>;
  return (
    <>
      {s.summaryLanguage === "en" && (
        <p className="m-0 text-xs text-muted-foreground">{t("card.foreignLanguage")}</p>
      )}
      <p
        {...(s.summaryLanguage === null ? {} : { lang: s.summaryLanguage })}
        className="m-0 text-sm"
      >
        {s.summary}
      </p>
      <WikipediaSource
        label={t("card.textCredit")}
        sourceUrl={s.sourceUrl}
        shown
        className="inline-flex min-h-11 items-center text-muted-foreground"
      />
    </>
  );
}

/** The attributes of DM-ENT-01; a value the catalog does not know reads "unbekannt" (P-08, FR-ENT-04). */
function Attributes({ s }: { s: Suggestion }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {attributeRows(s.attributes).flatMap(([name, value]) => [
        <dt key={`${name}-t`} className="text-muted-foreground">
          {name}
        </dt>,
        <dd key={`${name}-d`} className="m-0">
          {value}
        </dd>,
      ])}
    </dl>
  );
}

/**
 * What "Mehr" opens on a suggestion card (US-QS-15, US-ENT-01, owner decision d-159): the description with the credit of its
 * text, the attributes of DM-ENT-01, the reasons the card appears and, where a known attribute has a source, its sources
 * (US-ENT-09). The sheet scrolls; the front of the card keeps only the facts that decide the swipe.
 */
export function SuggestionDetails({ s }: { s: Suggestion }) {
  const sources = s.attributeSources ?? [];
  return (
    <div className="grid min-w-0 gap-4">
      <CardSection title={t("card.section.description")}>
        <Description s={s} />
      </CardSection>
      <CardSection title={t("card.section.attributes")}>
        <Attributes s={s} />
      </CardSection>
      <CardSection title={t("card.section.reasons")}>
        <ul className="m-0 grid list-disc gap-1 pl-5 text-sm">
          {s.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </CardSection>
      {sources.length > 0 && (
        <CardSection title={t("card.section.sources")}>
          <AttributeSources sources={sources} />
        </CardSection>
      )}
    </div>
  );
}
