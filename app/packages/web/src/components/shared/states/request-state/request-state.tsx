import type { ReactNode } from "react";
import { PlantLoader } from "@/components/shared/states/plant-loader/plant-loader";
import { EmptyState } from "../../empty-state/empty-state";

export type RequestStatus = "pending" | "error" | "empty" | "ready";

export type RequestStateProps = {
  status: RequestStatus;
  /** The text of the failure (the German text of the error code), shown with "Erneut versuchen". */
  errorText?: string;
  onRetry: () => void;
  /** Mirrors the view while it loads (DS-52); it carries the one loading status. Without it a `PlantLoader` shows. */
  skeleton?: ReactNode;
  /** Shown for `empty`: an `EmptyState` with a next action (P-09). */
  empty?: ReactNode;
  /** The data on screen is the last loaded copy because the network is down (US-QS-07). */
  offline?: boolean;
  /** Page level only: the main heading shown above the error, because a failed page has no content that carries it (US-QS-09). */
  heading?: string;
  children?: ReactNode;
};

export const OFFLINE_NOTE = "Offline - zuletzt geladene Daten";

/**
 * The one pattern for the four states of a request (DS-09, DS-26): pending shows the skeleton (or the PlantLoader), error the text with
 * "Erneut versuchen" (P-10), empty the empty state with its next action (P-09), ready the content, with a note when
 * it is the cached copy. Takes data and callbacks only (DS-44).
 */
export function RequestState(props: RequestStateProps) {
  const { status, errorText, onRetry, skeleton, empty, offline, heading, children } = props;
  if (status === "pending")
    return <>{skeleton ?? <PlantLoader className="mx-auto my-8 flex" size="lg" />}</>;
  if (status === "error")
    return (
      <>
        {heading ? <h1 className="mb-3 text-2xl font-semibold">{heading}</h1> : null}
        <EmptyState
          variant="error"
          title={errorText ?? "Das Laden ist fehlgeschlagen."}
          action={{ label: "Erneut versuchen", onClick: onRetry }}
        />
      </>
    );
  if (status === "empty") return <>{empty}</>;
  return (
    <>
      {offline ? (
        <p role="status" className="text-sm text-muted-foreground">
          {OFFLINE_NOTE}
        </p>
      ) : null}
      {children}
    </>
  );
}
