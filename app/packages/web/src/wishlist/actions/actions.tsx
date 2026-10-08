import { useEffect, useRef, useState } from "react";
import type { Candidate } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { errorText } from "@/lib/error-text";
import { useWriteAction, type ApiError, type Response } from "../../kernel";
import { buyWish, discardWish } from "../wishlist-api";

type Token = () => Promise<string | undefined>;
type Hint = { text: string; nextAction: string };

/** A bought wish that becomes a plant (US-WUN-05): what the app needs to find its species and to link the specimen. */
export interface WishToPlant {
  readonly id: string;
  /** Latin or working name, the start of the species search. */
  readonly name: string;
  /** "German (name)", for texts. */
  readonly title: string;
}

/** What a write on a candidate answered: the hint, and for a purchase the wish that can now become a plant. */
export interface Outcome {
  readonly hint: Hint;
  readonly toPlant: WishToPlant | null;
}

/**
 * "Gekauft" (US-WUN-03) and "Verwerfen" (US-WUN-05) on a candidate: the answer of the server says what happened and what
 * comes next (P-09, P-10).
 */
export function useCandidateWrite(
  api: string,
  token: Token,
  onWritten: () => void,
  onRun: () => void,
) {
  const write = useWriteAction(token, onWritten);
  const [done, setDone] = useState<Outcome | null>(null);
  const run = (
    c: Candidate,
    send: (t: string) => Promise<Response<{ hint: Hint }>>,
    toPlant: boolean,
  ) => {
    onRun();
    void write.run(async (t) => {
      const r = await send(t);
      setDone(
        r.ok
          ? {
              hint: r.value.hint,
              toPlant: toPlant ? { id: c.id, name: c.name, title: c.title } : null,
            }
          : null,
      );
      return r;
    }, "");
  };
  return {
    buy: (c: Candidate) => run(c, (t) => buyWish(api, t, c.id), true),
    discard: (c: Candidate) => run(c, (t) => discardWish(api, t, c.id), false),
    done,
    running: write.running,
    error: write.error,
  };
}

/** The confirmation takes the focus, so a keeper who tapped far down the list sees what happened (P-10). */
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
  /** Names the wish in the accessible name when several buttons stand next to each other. */
  named?: boolean;
}) {
  return (
    <Button
      type="button"
      size="touch"
      className="mt-2"
      aria-label={props.named ? `Exemplar anlegen: ${props.wish.title}` : "Exemplar anlegen"}
      onClick={() => props.onCreate(props.wish)}
    >
      Exemplar anlegen
    </Button>
  );
}

export function Alert({ error }: { error: ApiError }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
      {errorText(error.code)}
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
            Wunsch mit dem Exemplar verknüpft.
          </p>
          <div>
            <Button type="button" variant="outline" size="touch" onClick={onDrop}>
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
              <Button type="button" variant="outline" size="touch" onClick={notice.retry}>
                Erneut verknüpfen
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
