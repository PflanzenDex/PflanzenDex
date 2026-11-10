import { measurementPhotoPath } from "@pflanzendex/core";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton } from "@/shared/ui/display/skeleton/skeleton";
import { dateText } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { useStoredPhoto, type PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { useInView } from "@/shared/platform/visibility/use-in-view";
import { refusalText } from "@/shared/lib/error-text";
import table from "./measurement-photo.de.json";

const t = texts(table);

/**
 * The photo of one measurement (US-WAC-05). Photos are private (P-05): the bytes are fetched with the token and shown
 * from an object URL, never from a public link. A failure says why by its error code (P-10). The compact picture is a
 * list entry of the history: it asks the thumbnail and loads when it is near the viewport (NFR-12); the picture of the
 * measure page asks the stored copy. The address carries the version of the stored photo (`photo`), so a replaced
 * photo is fetched anew (NFR-12).
 */
export function MeasurementPhoto(
  props: PhotoAccess & {
    specimenId: string;
    measurementId: string;
    /** The stored photo of the measurement (its object name): the version of the address. */
    photo: string;
    date: string;
    /** A small picture for a paged list in a layer (US-QS-23). */
    compact?: boolean;
  },
) {
  const { api, token, specimenId, measurementId, photo, date } = props;
  const [ref, inView] = useInView<HTMLDivElement>();
  const path = measurementPhotoPath({ specimenId, measurementId, photo });
  const state = useStoredPhoto(
    { api, token },
    path,
    props.compact ? { size: "thumb", enabled: inView } : {},
  );
  // The outer box keeps the in-view ref at once; the skeleton inside shows only after the delay (DS-57, issue 1726).
  if (state === null)
    return (
      <div ref={ref}>
        <DelayedSkeleton>
          <div role="status">
            <Skeleton className={props.compact ? "h-20 w-full max-w-xs" : "h-40 w-full max-w-xs"} />
            <span className="sr-only">{t("loading")}</span>
          </div>
        </DelayedSkeleton>
      </div>
    );
  if (typeof state === "object")
    return (
      <p role="status" className="text-muted-foreground">
        {refusalText(state)}
      </p>
    );
  return (
    <img
      src={state}
      alt={t("alt", { date: dateText(date) })}
      className={cn(
        props.compact ? "max-h-24" : "max-h-64",
        "w-auto max-w-full rounded-lg object-contain",
      )}
    />
  );
}
