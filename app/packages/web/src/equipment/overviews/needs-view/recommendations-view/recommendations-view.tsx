import type { Recommendation } from "@pflanzendex/core";
import { useFeature } from "@/kernel";

const date = (iso: string) => iso.split("-").reverse().join(".");
const eur = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

/**
 * Recommendations (US-EQU-10): only in the context of a derived need, always labeled "Empfehlung" with the reason from
 * the keeper's own data, the source and the retrieval date. No link and no affiliate (legal basis TE-11 is open). A
 * price appears only with its source and date (P-08). Without a catalog or a match the block says what to do next (P-09).
 */
export function RecommendationsView(props: {
  data: { recommendations: readonly Recommendation[]; needs: readonly unknown[] };
}) {
  const on = useFeature("recommendations");
  const { recommendations, needs } = props.data;
  return on ? <Block recommendations={recommendations} needCount={needs.length} /> : null;
}

function Block(props: { recommendations: readonly Recommendation[]; needCount: number }) {
  const { recommendations, needCount } = props;
  return (
    <section
      aria-labelledby="equipment-recommendations-title"
      className="flex min-w-0 flex-col gap-3"
    >
      <h2 id="equipment-recommendations-title" className="text-xl font-semibold">
        Empfehlungen zu deinem Bedarf
      </h2>
      {recommendations.length === 0 ? (
        <p className="m-0 text-muted-foreground">
          {needCount === 0
            ? "Es gibt nichts zu empfehlen, weil nach deinen Angaben nichts fehlt. Trage Vorräte und Lampen unter Equipment ein, dann erkennt die App, was du brauchst."
            : "Zu deinem Bedarf liegt noch keine Produktempfehlung vor. Nächster Schritt: Such selbst nach einem passenden Produkt und kaufe dort, wo du magst."}
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {recommendations.map((r) => (
            <li
              key={`${r.needId}:${r.productId}`}
              className="min-w-0 rounded-lg border border-border p-3"
            >
              <p className="m-0 text-xs font-semibold uppercase text-muted-foreground">{r.label}</p>
              <h3 className="m-0 break-words font-semibold">{r.name}</h3>
              <p className="m-0 text-sm text-muted-foreground">{r.manufacturer}</p>
              <p className="m-0 mt-2 break-words text-sm">Grund: {r.reason}</p>
              <p className="m-0 mt-1 break-words text-sm text-muted-foreground">
                Quelle: {r.source} · Stand {date(r.retrievedOn)}
              </p>
              {r.price ? (
                <p className="m-0 mt-1 break-words text-sm">
                  Preis: {eur(r.price.cents)} (Quelle: {r.price.source}, Stand{" "}
                  {date(r.price.retrievedOn)})
                </p>
              ) : null}
              <p className="m-0 mt-1 text-sm">{r.nextAction}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
