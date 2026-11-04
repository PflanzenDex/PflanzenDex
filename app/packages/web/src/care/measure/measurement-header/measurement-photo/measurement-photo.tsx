import { Skeleton } from "@/shared/ui/display/skeleton/skeleton";
import { dateText } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { useStoredPhoto, type PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { useInView } from "@/shared/platform/visibility/use-in-view";
import { refusalText } from "../../../shared/notices/notices";
import table from "./measurement-photo.de.json";

const t = texts(table);

/**
 * The photo of one measurement (US-WAC-05). Photos are private (P-05): the bytes are fetched with the token and shown
 * from an object URL, never from a public link. A failure says why by its error code (P-10). The compact picture is a
 * list entry of the history: it asks the thumbnail and loads when it is near the viewport (NFR-12); the picture of the
 * measure page asks the stored copy.
 */
export function MeasurementPhoto(
  props: PhotoAccess & {
    specimenId: string;
    measurementId: string;
    date: string;
    /** A small picture for a paged list in a layer (US-QS-23). */
    compact?: boolean;
  },
) {
  const { api, token, specimenId, measurementId, date } = props;
  const [ref, inView] = useInView<HTMLDivElement>();
  const path = `/specimens/${encodeURIComponent(specimenId)}/measurements/${encodeURIComponent(measurementId)}/photo`;
  const state = useStoredPhoto(
    { api, token },
    path,
    props.compact ? { size: "thumb", enabled: inView } : {},
  );
  if (state === null)
    return (
      <div role="status" ref={ref}>
        <Skeleton className={props.compact ? "h-20 w-full max-w-xs" : "h-40 w-full max-w-xs"} />
        <span className="sr-only">{t("loading")}</span>
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
