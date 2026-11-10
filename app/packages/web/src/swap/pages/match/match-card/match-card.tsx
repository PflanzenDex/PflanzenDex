import type { MatchCard as Card } from "@pflanzendex/core";
import { Badge } from "@/shared/ui/display/badge/badge";
import { cn } from "@/shared/lib/utils";
import { healthText, MODE_TEXT, TYPE_TEXT } from "../../../parts/offer-form/health-text";

/** Why the card appears and what makes it special: the wish with the own reasoning, and "fits both ways" as a fact (US-TAU-04, US-TAU-05). */
function Reasons(props: { card: Card }) {
  const c = props.card;
  const wishes = c.reasons.flatMap((r) => (r.kind === "wishlist" ? [r] : []));
  const both = c.reasons.flatMap((r) => (r.kind === "both_ways" ? [r] : []));
  return (
    <section aria-label="Grund" className="flex flex-wrap items-center gap-2">
      {wishes.map((r) => (
        <Badge key={r.species} variant="outline">{`Auf deiner Wunschliste: ${r.species}`}</Badge>
      ))}
      {wishes.map(
        (r) =>
          r.reasoning !== null && (
            <p key={`${r.species}-why`} className="m-0 w-full whitespace-pre-line text-sm">
              {`Dein Grund: ${r.reasoning}`}
            </p>
          ),
      )}
      {both.length > 0 && <Badge variant="secondary">Passt in beide Richtungen</Badge>}
      {both.map((r) => (
        <p key={r.offerId} className="m-0 w-full text-sm">
          {`${c.ownerName ?? "Ein Freund"} möchte ${r.speciesGerman ?? r.speciesLatin ?? "dein Angebot"} von dir.`}
        </p>
      ))}
    </section>
  );
}

/** One offer of a friend as a card (US-TAU-01): names, giver, type, mode, note, health and the reason it is shown (US-TAU-04). No score; the gesture and its stamps are the shared `SwipeCard` around it (US-TAU-02). */
export function MatchCard(props: { card: Card }) {
  const { card: c } = props;
  return (
    <article
      aria-labelledby="match-title"
      className={cn(
        "grid w-full min-w-0 touch-pan-y content-start gap-2 break-words",
        "rounded-xl border border-border bg-card p-4 text-card-foreground",
      )}
    >
      <div>
        <h2 id="match-title" tabIndex={-1} className="m-0 text-xl font-semibold focus:outline-none">
          {c.speciesGerman ?? c.speciesLatin ?? "Art unbekannt"}
        </h2>
        {c.speciesLatin && c.speciesGerman && (
          <p className="m-0 text-sm italic">{c.speciesLatin}</p>
        )}
      </div>
      <p className="m-0">
        {`Von ${c.ownerName ?? "einem Freund"} · ${TYPE_TEXT[c.type]} · ${MODE_TEXT[c.mode]}`}
      </p>
      {c.wish && <p className="m-0 text-sm">{`Wunsch: ${c.wish}`}</p>}
      {c.note && <p className="m-0 text-sm">{`Hinweis: ${c.note}`}</p>}
      <p className="m-0 text-sm text-muted-foreground">{healthText(c.health)}</p>
      {c.phase === "dormancy" && (
        <p className="m-0 text-sm text-muted-foreground">Zurzeit in der Ruhephase.</p>
      )}
      <Reasons card={c} />
    </article>
  );
}
