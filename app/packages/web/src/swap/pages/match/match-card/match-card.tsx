import type { MatchCard as Card } from "@pflanzendex/core";
import { useRef, type PointerEvent } from "react";
import { Badge } from "@/components/ui/display/badge/badge";
import { cn } from "@/lib/utils";
import { healthText, MODE_TEXT, TYPE_TEXT } from "../../../parts/offer-form/health-text";

/** Share of the card width a swipe must cover (US-TAU-02, starting value 40 percent, assumption). */
export const SWIPE_SHARE = 0.4;

/** Direction of a swipe: left is "Nein", right is "Ja"; a short or mostly vertical move (a scroll) decides nothing. */
export function swipeSide(dx: number, dy: number, width: number): "left" | "right" | null {
  if (width <= 0 || Math.abs(dx) < width * SWIPE_SHARE || Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? "left" : "right";
}

/** One offer of a friend as a card (US-TAU-01): names, giver, type, mode, note, health and the reason it is shown (US-TAU-04). No score. */
export function MatchCard(props: { card: Card; onSwipe: (side: "left" | "right") => void }) {
  const { card: c } = props;
  const start = useRef<{ x: number; y: number } | null>(null);
  const up = (e: PointerEvent<HTMLElement>) => {
    const from = start.current;
    start.current = null;
    const side =
      from && swipeSide(e.clientX - from.x, e.clientY - from.y, e.currentTarget.clientWidth);
    if (side) props.onSwipe(side);
  };
  return (
    // No animation at all: with `prefers-reduced-motion` and without, the next card simply appears (NFR-13).
    <article
      aria-labelledby="match-title"
      onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={up}
      onPointerCancel={() => (start.current = null)}
      className={cn(
        "mx-auto grid w-full min-w-0 max-w-md touch-pan-y content-start gap-2 break-words",
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
      <section aria-label="Grund" className="flex flex-wrap items-center gap-2">
        {c.reasons.map((r) => (
          <Badge key={r.species} variant="outline">{`Auf deiner Wunschliste: ${r.species}`}</Badge>
        ))}
        {c.reasons.map(
          (r) =>
            r.reasoning !== null && (
              <p key={`${r.species}-why`} className="m-0 w-full whitespace-pre-line text-sm">
                {`Dein Grund: ${r.reasoning}`}
              </p>
            ),
        )}
      </section>
    </article>
  );
}
