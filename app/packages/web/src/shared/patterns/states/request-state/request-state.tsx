import { useEffect, useRef, type ReactNode } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import { useOnline } from "@/shared/platform/browser/network";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { PlantLoader } from "@/shared/patterns/states/plant-loader/plant-loader";
import { DelayedSkeleton, useHeldLoader } from "@/shared/ui/skeleton.delayed";
import { EmptyState } from "../../elements/empty-state/empty-state";
import table from "./request-state.de.json";

const ui = texts(table);
/** The title of a failure while the device is offline: the view is not loaded yet, and the server did not fail (US-QS-32). */
const offlineTitle = ui("offline");
const offlineHint = ui("offlineHint");

export type RequestStatus = "pending" | "error" | "empty" | "ready";

export type RequestStateProps = {
  status: RequestStatus;
  /** The text of the failure (the German text of the error code), shown with "Erneut versuchen". */
  errorText?: string;
  onRetry: () => void;
  /** Mirrors the view while it loads (DS-52); it carries the one loading status. Never held (DS-57, D5). */
  skeleton?: ReactNode;
  /**
   * A shapeless loader instead of a skeleton: a centred status text without a shape (US-QS-14, D5, issue 1772). It is held
   * once it has shown. Without it and without `skeleton` a `PlantLoader` shows.
   */
  loader?: ReactNode;
  /** Shown for `empty`: an `EmptyState` with a next action (P-09). */
  empty?: ReactNode;
  /** The data on screen is the last loaded copy because the network is down (US-QS-07). */
  offline?: boolean;
  /** Page level only: the main heading shown above the error, because a failed page has no content that carries it (US-QS-09). */
  heading?: string;
  /**
   * The caller owns the offline failure (US-QS-32, issue 1884): it shows a failed write with its own text and already loads
   * again when the device is back online. Then the error keeps `errorText` while offline, and coming back online does not
   * call `onRetry`, so nothing runs twice. Without it an error while offline says the view is not loaded yet, and coming
   * back online while the error shows calls `onRetry` once. Only the callers that retry on their own set it.
   */
  ownOffline?: boolean;
  children?: ReactNode;
};

export const OFFLINE_NOTE = "Offline - zuletzt geladene Daten";

/**
 * The one pattern for the four states of a request (DS-09, DS-26): pending shows the skeleton (or the loader) after the
 * delay of DS-57 (issue 1726), so a request that ends sooner shows no skeleton and no status; a shaped skeleton goes as
 * soon as the content is there, a shapeless loader stays at least `STATUS_HOLD_MS` once it has shown (US-QS-14, D5, issue
 * 1772); error the text with "Erneut versuchen" (P-10), empty the empty state with its next action (P-09), ready the
 * content, with a note when it is the cached copy. Takes data and callbacks only (DS-44).
 *
 * Offline (US-QS-32, issue 1884): a failure while the device has no connection says that the view is not loaded yet and
 * loads again by itself. The device coming back online while the failure shows calls `onRetry` once; only that moment
 * counts, so a failure that arrives online waits for the press. `ownOffline` leaves both to the caller.
 */
export function RequestState(props: RequestStateProps) {
  const {
    status,
    errorText,
    onRetry,
    skeleton,
    loader,
    empty,
    offline,
    heading,
    ownOffline,
    children,
  } = props;
  const shaped = skeleton !== undefined && skeleton !== null;
  const held = useHeldLoader(status === "pending" && !shaped);
  const online = useOnline();
  const wasOnline = useRef(online);
  useEffect(() => {
    const back = online && !wasOnline.current;
    wasOnline.current = online;
    if (back && status === "error" && !ownOffline) onRetry();
  }, [online, status, ownOffline, onRetry]);
  if (status === "pending" && shaped) return <DelayedSkeleton>{skeleton}</DelayedSkeleton>;
  if (held)
    return (
      <DelayedSkeleton>
        {loader ?? <PlantLoader className="mx-auto my-8 flex" size="lg" />}
      </DelayedSkeleton>
    );
  const offlineFailure = !online && !ownOffline;
  if (status === "error")
    return (
      <>
        {heading ? <PageHeader title={heading} className="mb-3" /> : null}
        <EmptyState
          variant="error"
          title={offlineFailure ? offlineTitle : (errorText ?? "Das Laden ist fehlgeschlagen")}
          {...(offlineFailure ? { description: offlineHint } : {})}
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
