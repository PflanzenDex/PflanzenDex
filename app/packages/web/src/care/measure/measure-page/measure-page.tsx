import { useCallback, useMemo, useRef } from "react";
import { GrowthMomentNote, useGrowthMoments } from "@/achievements";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { useSay } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { LoadFrame, useInvalidate } from "../../../shared/data";
import { MeasureForm } from "../measure-form/measure-form";
import { loadMeasurementView } from "../../shared/api/measurements-api";
import { MeasurementHeader } from "../measurement-header/measurement-header";
import { MeasurePageSkeleton } from "./measure-page.skeleton";
import { CourseLayer } from "./course-layer/course-layer";
import { useMeasureSend } from "../measurement-header/measurement-photo";

type Token = () => Promise<string | undefined>;

/**
 * The reserved slot of the growth note (DS-54): the note fills it, so the form below never moves when it appears. The
 * slot keeps two lines of room even while there is no note.
 */
function GrowthSlot(props: { moments: ReturnType<typeof useGrowthMoments>; justSaved: boolean }) {
  return (
    <div className="min-h-16" data-slot="growth-note">
      <GrowthMomentNote moments={props.moments} justSaved={props.justSaved} />
    </div>
  );
}

/** The loading text of the measure page (also its skeleton label). */
const LOADING = "Messungen werden geladen …";

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
  const say = useSay();
  const { send, saved } = useMeasureSend({
    api,
    token,
    specimenId: specimen.id,
    invalidate,
    say,
  });
  const moments = useGrowthMoments(api, token, specimen.id);
  return (
    <section aria-labelledby="measure-title" className="flex min-w-0 flex-col gap-3">
      <PageHeader
        headingId="measure-title"
        title={`Messen: ${specimen.name}`}
        back={{ label: "Zurück zur Sammlung", onBack: props.onBack }}
      />
      <LoadFrame
        queryKey={key}
        token={token}
        load={load}
        loadingText={LOADING}
        loadingFallback={<MeasurePageSkeleton label={LOADING} />}
      >
        {(view) => (
          <>
            <MeasurementHeader
              view={view}
              action={<LayerOpener id={course}>Verlauf ({view.measurements.length})</LayerOpener>}
            />
            <GrowthSlot moments={moments} justSaved={Boolean(saved)} />
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
