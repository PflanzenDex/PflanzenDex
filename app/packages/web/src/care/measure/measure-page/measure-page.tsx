import { useCallback, useMemo, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { GrowthMomentNote, useGrowthMoments } from "@/achievements";
import { Button } from "@/components/ui/button/button";
import { LayerOpener } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { LoadFrame, useInvalidate } from "../../../kernel";
import { MeasureForm } from "../measure-form/measure-form";
import { loadMeasurementView } from "../../shared/api/measurements-api";
import { MeasurementHeader } from "../measurement-header/measurement-header";
import { MeasurePageSkeleton } from "./measure-page.skeleton";
import { CourseLayer } from "./course-layer/course-layer";
import { useMeasureSend } from "../measurement-header/measurement-photo";
import { RefusalAlert, StatusNote } from "../../shared/notices/notices";

type Token = () => Promise<string | undefined>;

/** The way back and the name of the page, one row (US-QS-15): the arrow button goes back to the collection. */
function MeasureHeading(props: { name: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Zurück zur Sammlung"
        onClick={props.onBack}
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Button>
      <h1 id="measure-title" className="min-w-0 text-xl font-semibold [overflow-wrap:anywhere]">
        Messen: {props.name}
      </h1>
    </div>
  );
}

/**
 * Measure (US-WAC-01): on the page the one fact line (last measurement, value and date) with the link "Verlauf (n)", the
 * input form and the sticky "Messung speichern". The facts and the course of the specimen live in the layer "Verlauf"
 * (US-QS-15). Every view says what to do next (P-09).
 */
export function MeasurePage(props: {
  api: string;
  token: Token;
  specimen: { id: string; name: string };
  onBack: () => void;
}) {
  const { api, token, specimen } = props;
  const key = useMemo(() => ["care", "measurements", specimen.id], [specimen.id]);
  const invalidate = useInvalidate(key);
  const valueRef = useRef<HTMLInputElement | null>(null);
  const course = `verlauf-${specimen.id}`;
  const load = useCallback(
    (t: string) => loadMeasurementView(api, t, specimen.id),
    [api, specimen.id],
  );
  const { send, photoRefusal, saved } = useMeasureSend({
    api,
    token,
    specimenId: specimen.id,
    invalidate,
  });
  const moments = useGrowthMoments(api, token, specimen.id);
  const loading = "Messungen werden geladen …";
  return (
    <section aria-labelledby="measure-title" className="flex min-w-0 flex-col gap-3">
      <MeasureHeading name={specimen.name} onBack={props.onBack} />
      <LoadFrame
        queryKey={key}
        token={token}
        load={load}
        loadingText={loading}
        loadingFallback={<MeasurePageSkeleton label={loading} />}
      >
        {(view) => (
          <>
            <MeasurementHeader
              view={view}
              action={<LayerOpener id={course}>Verlauf ({view.measurements.length})</LayerOpener>}
            />
            {saved && <StatusNote>Gespeichert: {saved}.</StatusNote>}
            <GrowthMomentNote moments={moments} justSaved={Boolean(saved)} />
            {photoRefusal && <RefusalAlert error={photoRefusal} />}
            <MeasureForm unit="cm" signs={view.etiolationSigns} onSend={send} focusRef={valueRef} />
            <CourseLayer
              id={course}
              name={specimen.name}
              view={view}
              photo={{ api, token, specimenId: specimen.id }}
              records={moments?.records}
              onPhotoSaved={invalidate}
            />
          </>
        )}
      </LoadFrame>
    </section>
  );
}
