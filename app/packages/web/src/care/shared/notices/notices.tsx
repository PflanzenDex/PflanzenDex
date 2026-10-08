import { useEffect, useRef } from "react";
import { errorText } from "@/lib/error-text";
import type { ApiError } from "../../../kernel";

/**
 * The German text of a refusal (DS-49, P-10): by its error code, never the raw server text. The one code the web app
 * makes up itself (the server did not answer) carries its own German text.
 */
export const refusalText = (error: ApiError): string =>
  error.code === "network.not_reachable" ? error.text : errorText(error.code);

/** What a successful action says happened (P-09). */
export function StatusNote(props: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-lg border border-border p-3">
      {props.children}
    </p>
  );
}

/** A refusal of an action: stays visible with the text of its code and takes the focus (P-10). */
export function RefusalAlert({ error }: { error: ApiError }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [error]);
  return (
    <div
      role="alert"
      tabIndex={-1}
      ref={ref}
      className="rounded-lg border border-destructive p-3 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p>{refusalText(error)}</p>
    </div>
  );
}

/** Marks a row that needs attention (overdue, due today): text first, the border and tint only underline it (a full border: a thick left edge follows the pill's round corner, #608). */
export const ATTENTION_CLASSES = "border border-warning-border bg-warning text-warning-foreground";

/** Card of one list entry. */
export const CARD_CLASSES = "min-w-0 rounded-lg border border-border p-3 [overflow-wrap:anywhere]";

/** A list of cards on a phone: one column, no bullets. */
export const LIST_CLASSES = "m-0 flex list-none flex-col gap-3 p-0";

/** A warning line (deviation, missing location). */
export const WARNING_CLASSES =
  "rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground";
