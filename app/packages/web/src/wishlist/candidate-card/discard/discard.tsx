import { useEffect, useRef, useState, type Ref } from "react";
import type { Candidate } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";

/**
 * "Verwerfen" asks before it writes: the wish stays stored under "Verworfen", but there is no way back yet (P-10). The
 * question has two parts, the trigger and the question, so a caller can place them apart: the wish row puts the question
 * below its row, where it has the width of the row (US-QS-32). The focus follows the question: the question takes it when it
 * opens, and "Abbrechen" gives it back to the trigger (WCAG 2.4.3).
 */

/** The trigger "Verwerfen": it opens the question. `triggerRef` is where the focus returns after "Abbrechen". */
export function DiscardTrigger(props: {
  c: Candidate;
  busy: boolean;
  /** Small button in a compact row (US-QS-22); otherwise the touch size of a card. */
  compact?: boolean;
  onAsk: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const { c, compact } = props;
  return (
    <Button
      ref={props.triggerRef}
      type="button"
      variant="plain"
      size={compact ? "sm" : "touch"}
      className={compact ? undefined : "rounded-full"}
      disabled={props.busy}
      aria-label={`Verwerfen: ${c.title}`}
      onClick={() => props.onAsk()}
    >
      Verwerfen
    </Button>
  );
}

/** The question "Wirklich verwerfen?" with its two buttons; "Verwerfen" takes the focus when the question opens. */
export function DiscardQuestion(props: {
  c: Candidate;
  busy: boolean;
  onDiscard: (c: Candidate) => void;
  onCancel: () => void;
}) {
  const { c } = props;
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    yes.current?.focus();
  }, []);
  return (
    <div className="grid gap-2">
      <p>Wirklich verwerfen? Der Wunsch bleibt unter „Verworfen“ gespeichert.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          ref={yes}
          type="button"
          variant="destructive"
          size="touch"
          disabled={props.busy}
          aria-label={`Verwerfen: ${c.title}`}
          onClick={() => props.onDiscard(c)}
        >
          Verwerfen
        </Button>
        <Button type="button" variant="plain" size="touch" onClick={() => props.onCancel()}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

/**
 * Whether the question is open, and the focus around it: "Abbrechen" puts the focus back on the trigger, which is mounted
 * again only after the question has gone, so the focus moves once the trigger shows.
 */
export function useDiscardQuestion() {
  const [asking, setAsking] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (asking || !returnFocus.current) return;
    returnFocus.current = false;
    triggerRef.current?.focus();
  }, [asking]);
  return {
    asking,
    triggerRef,
    ask: () => setAsking(true),
    cancel: () => {
      returnFocus.current = true;
      setAsking(false);
    },
  };
}

/** "Verwerfen" of a card: the trigger, and the question in its place, both in the card (US-WUN-05). */
export function Discard(props: { c: Candidate; onDiscard: (c: Candidate) => void; busy: boolean }) {
  const { asking, triggerRef, ask, cancel } = useDiscardQuestion();
  if (!asking)
    return <DiscardTrigger c={props.c} busy={props.busy} triggerRef={triggerRef} onAsk={ask} />;
  return (
    <DiscardQuestion c={props.c} busy={props.busy} onDiscard={props.onDiscard} onCancel={cancel} />
  );
}
