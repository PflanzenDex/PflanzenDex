import { useEffect, useRef } from "react";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { Button } from "@/shared/ui/button";
import { errorText } from "@/shared/lib/error-text";
import type { ApiError } from "../../shared/data";
import { useCandidateWrite, type Outcome, type WishToPlant } from "./use-candidate-write";

export { useCandidateWrite };
export type { Outcome, WishToPlant };

function Done(props: { done: Outcome; onCreateSpecimen?: (w: WishToPlant) => void }) {
  const { done, onCreateSpecimen } = props;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [done]);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="rounded-lg border border-primary p-3">
      <p>{done.hint.text}</p>
      <p className="mt-1 font-semibold">{done.hint.nextAction}</p>
      {done.toPlant && onCreateSpecimen && (
        <CreateSpecimenButton wish={done.toPlant} onCreate={onCreateSpecimen} />
      )}
    </div>
  );
}

/** The first step of the way to the plant (US-WUN-05): species preselected, the wish linked to the specimen. */
export function CreateSpecimenButton(props: {
  wish: WishToPlant;
  onCreate: (w: WishToPlant) => void;
  /** The filled next step after a purchase; a row of the bought list is tinted (SG-BTN-02). */
  variant?: "default" | "tinted";
  /** Names the wish in the accessible name when several buttons stand next to each other. */
  named?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={props.variant}
      size="touch"
      className="mt-2"
      aria-label={props.named ? `Pflanze anlegen: ${props.wish.title}` : "Pflanze anlegen"}
      onClick={() => props.onCreate(props.wish)}
    >
      Pflanze anlegen
    </Button>
  );
}

export function Alert({ error }: { error: ApiError }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
      {errorText(error.code)}
      <RefusalClose error={error} />
    </p>
  );
}

/** The outcome of the write that ran last (P-10): an error, or the confirmation with what comes next. */
export function WriteOutcome(props: {
  done: Outcome | null;
  error: ApiError | null;
  onCreateSpecimen?: (w: WishToPlant) => void;
}) {
  if (props.error) return <Alert error={props.error} />;
  if (!props.done) return null;
  return (
    <Done
      done={props.done}
      {...(props.onCreateSpecimen ? { onCreateSpecimen: props.onCreateSpecimen } : {})}
    />
  );
}

/** A line above the page that says what happened or what to do (P-09, P-10); it belongs to one address. */
export type PathNotice = {
  readonly kind: "status" | "alert";
  readonly text: string;
  readonly path: string;
  readonly retry?: () => void;
};

/**
 * What the keeper sees above the page while a bought wish is on its way to the specimen (US-WUN-05), and the outcome of
 * the link afterwards. The app owns the state (it wires `wishlist`, `catalog` and `collection`); this only shows it.
 */
export function PathNotes(props: {
  wish: WishToPlant | null;
  notice: PathNotice | null;
  /** The current address: a notice shows only on its own page. */
  pathname: string;
  onDrop: () => void;
}) {
  const { wish, notice, onDrop } = props;
  return (
    <>
      {wish && (
        <div role="status" className="mb-3 grid gap-2 rounded-lg border border-primary p-3">
          <p>
            Du legst gerade die Pflanze zum Wunsch „{wish.title}“ an. Nach dem Anlegen wird der
            Wunsch mit der Pflanze verknüpft.
          </p>
          <div>
            <Button type="button" variant="plain" size="touch" onClick={onDrop}>
              Verknüpfung abbrechen
            </Button>
          </div>
        </div>
      )}
      {notice && notice.path === props.pathname && (
        <div
          role={notice.kind === "alert" ? "alert" : "status"}
          className="mb-3 grid gap-2 rounded-lg border border-border p-3"
        >
          <p>{notice.text}</p>
          {notice.retry && (
            <div>
              <Button type="button" variant="tinted" size="touch" onClick={notice.retry}>
                Erneut verknüpfen
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
