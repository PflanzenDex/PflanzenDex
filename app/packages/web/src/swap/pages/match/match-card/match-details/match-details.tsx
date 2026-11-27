import { CARE_PHASES, type MatchCard as Card } from "@pflanzendex/core";
import { CardSection } from "@/shared/patterns/display/card/card-more/card-more";
import { texts } from "@/shared/lib/text-rules/texts";
import { healthText } from "../../../../parts/offer-form/health-text";
import table from "../../../../swap.de.json";

const t = texts(table);

/** The care phase in which a plant rests and gives no cutting: the second of the two phases of the core. */
const DORMANCY = CARE_PHASES[1];

/** One reason with the words of the keeper or of the giver under it (US-TAU-04, US-TAU-05). */
function Reasons({ card: c }: { card: Card }) {
  const name = c.ownerName ?? t("deck.friendFallback");
  return (
    <ul className="m-0 grid list-none gap-2 p-0 text-sm">
      {c.reasons.map((r) =>
        r.kind === "both_ways" ? (
          <li key={`both-${r.offerId}`} className="grid gap-1">
            <span className="font-semibold">{t("card.reasonBothWays")}</span>
            <span>
              {t("card.reasonTheirs", {
                name,
                species: r.speciesGerman ?? r.speciesLatin ?? t("card.reasonTheirsFallback"),
              })}
            </span>
          </li>
        ) : (
          <li key={`wish-${r.species}`} className="grid gap-1">
            <span className="font-semibold">{t("card.reasonWishlist")}</span>
            {r.reasoning !== null && (
              <span className="whitespace-pre-line">
                {t("card.reasonOwn", { reasoning: r.reasoning })}
              </span>
            )}
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * What "Mehr" opens on a match card (US-QS-15, US-TAU-01, owner decision d-160): the health of the plant, the note and the wish
 * of the giver, and every reason the card appears. A section shows only when it has content; "Gesundheit" always does (it says
 * "Keine Behandlung bekannt" when nothing is known, P-08). The sheet scrolls; the front keeps what decides the swipe.
 */
export function MatchDetails({ card: c }: { card: Card }) {
  const owner = c.ownerName ?? t("card.ownerFallback");
  return (
    <div className="grid min-w-0 gap-4">
      <CardSection title={t("card.section.health")}>
        <p className="m-0 text-sm">{healthText(c.health)}</p>
        {c.phase === DORMANCY && (
          <p className="m-0 text-sm text-muted-foreground">{t("card.dormancy")}</p>
        )}
      </CardSection>
      {c.note && (
        <CardSection title={t("card.section.note", { name: owner })}>
          <p className="m-0 whitespace-pre-line text-sm">{c.note}</p>
        </CardSection>
      )}
      {c.wish && (
        <CardSection title={t("card.section.wish", { name: owner })}>
          <p className="m-0 whitespace-pre-line text-sm">{c.wish}</p>
        </CardSection>
      )}
      {c.reasons.length > 0 && (
        <CardSection title={t("card.section.reasons")}>
          <Reasons card={c} />
        </CardSection>
      )}
    </div>
  );
}
