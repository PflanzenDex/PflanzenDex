import { Button } from "@/shared/ui/button";
import { DelayedSkeleton, useHeldLoader } from "@/shared/ui/skeleton.delayed";
import { PlantLoader } from "@/shared/patterns/states/plant-loader/plant-loader";
import { texts } from "@/shared/lib/text-rules/texts";
import type { PagerPaging } from "../../paging";
import table from "./list-end.de.json";

const t = texts(table);

// The rows span every column (`col-span-full`) when the list is a grid.

/** The attribute of a row at the end of the list that is no entry (loader, retry, end marker): the measure of the end skips it. */
export const END_ROW = "data-list-end";

/**
 * The loader row (US-QS-15, SG-LIST-01): a spinner and no visible text, never a tab stop. The screen reader hears "Weitere
 * werden geladen …" (a polite status). Its place is kept from the start, so it does not move the rows when it shows after
 * the delay of DS-57. With a skeleton per missing entry (`quiet`) the skeletons are the picture and only the status stays.
 */
function LoaderRow({ quiet }: { quiet: boolean }) {
  const before = quiet ? null : (
    <li aria-hidden="true" data-list-end="" className="col-span-full h-10" />
  );
  return (
    <DelayedSkeleton before={before}>
      {quiet ? (
        <li data-list-end="" className="sr-only">
          <span role="status" aria-live="polite">
            {t("loading")}
          </span>
        </li>
      ) : (
        <li data-list-end="" className="col-span-full flex h-10 items-center justify-center">
          <PlantLoader size="sm" label={t("loading")} />
        </li>
      )}
    </DelayedSkeleton>
  );
}

/**
 * The retry row of a failed part (P-10): "Der Rest konnte nicht geladen werden." and "Erneut versuchen". The text sits
 * above the button, so it never breaks beside it at 200 % text. The loaded entries stay; a cause the caller knows
 * (`failure`) is added below the sentence.
 */
function RetryRow({ paging }: { paging: PagerPaging }) {
  return (
    <li data-list-end="" className="col-span-full flex flex-col items-start gap-2 py-2">
      <p role="alert" className="text-sm">
        {t("failed")}
        {paging.failure ? (
          <>
            {" "}
            <span className="block text-muted-foreground">{paging.failure}</span>
          </>
        ) : null}
      </p>
      <Button type="button" variant="tinted" onClick={paging.onRetry}>
        {t("retry")}
      </Button>
    </li>
  );
}

/** "Das waren alle 84": calm text, no control. The count is the filtered total when the list is filtered. */
function EndMarker({ count }: { count: number }) {
  return (
    <li data-list-end="" className="col-span-full py-2 text-center text-sm text-muted-foreground">
      {t("end", { count: count.toLocaleString("de-DE") })}
    </li>
  );
}

/**
 * What stands after the last entry of a scrolling list (SG-LIST-01): the loader row while a part is on its way, the retry
 * row when it failed, the end marker once every entry is there and the count is known (`marker`, undefined otherwise).
 * `missing` is true while entries are asked for and not there; a list without `paging` has no part on its way, so it shows
 * the marker only. It renders list items, so it belongs inside the list.
 */
export function ListEnd({
  paging,
  missing,
  marker,
}: {
  paging: PagerPaging | undefined;
  missing: boolean;
  marker: number | undefined;
}) {
  const pending = paging !== undefined && missing && paging.failure === undefined;
  const held = useHeldLoader(pending);
  // The hold keeps a loader that ended well; after a failure the retry row stands at once (P-10, issue 2591): a tap on it
  // must never land on a row the hold is about to swap for the loader.
  const loading = pending && held;
  if (paging && loading) return <LoaderRow quiet={paging.placeholder !== undefined} />;
  if (paging && missing) return <RetryRow paging={paging} />;
  return marker === undefined ? null : <EndMarker count={marker} />;
}
