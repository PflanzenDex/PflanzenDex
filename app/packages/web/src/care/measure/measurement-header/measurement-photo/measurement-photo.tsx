import { Skeleton } from "@/components/ui/display/skeleton/skeleton";
import { dateText } from "@/lib/format";
import { useStoredPhoto, type PhotoAccess } from "@/lib/use-stored-photo";
import { refusalText } from "../../../shared/notices/notices";

/**
 * The photo of one measurement (US-WAC-05). Photos are private (P-05): the bytes are fetched with the token and shown
 * from an object URL, never from a public link. A failure says why by its error code (P-10).
 */
export function MeasurementPhoto(
  props: PhotoAccess & { specimenId: string; measurementId: string; date: string },
) {
  const { api, token, specimenId, measurementId, date } = props;
  const path = `/specimens/${encodeURIComponent(specimenId)}/measurements/${encodeURIComponent(measurementId)}/photo`;
  const state = useStoredPhoto({ api, token }, path);
  if (state === null)
    return (
      <div role="status">
        <Skeleton className="h-40 w-full max-w-xs" />
        <span className="sr-only">Foto wird geladen …</span>
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
      alt={`Foto der Messung vom ${dateText(date)}`}
      className="max-h-64 w-auto max-w-full rounded-lg object-contain"
    />
  );
}
