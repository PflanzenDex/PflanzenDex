import { useState } from "react";
import type { Candidate } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";

/** "Verwerfen" asks before it writes: the wish stays stored under "Verworfen", but there is no way back yet (P-10). */
export function Discard(props: {
  c: Candidate;
  onDiscard: (c: Candidate) => void;
  busy: boolean;
  /** Small button and, when asking, the full width of a row that wraps (US-QS-22). */
  compact?: boolean;
}) {
  const { c, compact } = props;
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "touch"}
        className={compact ? undefined : "rounded-full"}
        disabled={props.busy}
        aria-label={`Verwerfen: ${c.title}`}
        onClick={() => setAsking(true)}
      >
        Verwerfen
      </Button>
    );
  return (
    <div className={cn("grid gap-2", compact && "basis-full")}>
      <p>Wirklich verwerfen? Der Wunsch bleibt unter „Verworfen“ gespeichert.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="touch"
          disabled={props.busy}
          aria-label={`Ja, verwerfen: ${c.title}`}
          onClick={() => props.onDiscard(c)}
        >
          Ja, verwerfen
        </Button>
        <Button type="button" variant="outline" size="touch" onClick={() => setAsking(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
