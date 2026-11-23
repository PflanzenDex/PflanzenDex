import { useCallback, useMemo, useRef, type ComponentProps } from "react";
import type { MeasurementView } from "@pflanzendex/core";
import { growthNoteText, useGrowthMoments } from "@/achievements";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { useSay } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { useInvalidate } from "../../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { MeasureForm } from "../measure-form/measure-form";
import { loadMeasurementView } from "../../shared/api/measurements-api";
import { MeasurementHeader } from "../measurement-header/measurement-header";
import { MeasurePageSkeleton } from "./measure-page.skeleton";
import { CourseLayer } from "./course-layer/course-layer";
import { GrowthNoteLayer } from "./growth-note-layer/growth-note-layer";
import { useSaveAnnouncement } from "./growth-note-layer/use-save-announcement";
import { useMeasureSend } from "../measurement-header/measurement-photo";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./measure-page.de.json";

const ui = texts(table);

type Token = () => Promise<string | undefined>;

/** The loading text of the measure page (also its skeleton label). */
const LOADING = "Messungen werden geladen …";

/**
 * Measure (US-WAC-01): on the page the one fact line (last measurement, value and date) with the link "Messverlauf (n)", the
 * input form with its bar "Abbrechen" and "Messung sichern" at the top (SG-SHEET-04). The facts and the course of the specimen live in the layer "Messverlauf"
 * (US-QS-15). Every view says what to do next (P-09).
 */
/** `onSaved` is called after a measurement was written; the page stays open (US-QS-15). */
type MeasurePageProps = {
  api: string;
  token: Token;
  specimen: { id: string; name: string };
  onBack: () => void;
  onSaved?: () => void;
};

type MeasuredProps = {
  view: MeasurementView;
  api: string;
  token: Token;
  specimen: { id: string; name: string };
  course: string;
  moments: ReturnType<typeof useGrowthMoments>;
  justSaved: boolean;
  saves: number;
  send: ReturnType<typeof useMeasureSend>["send"];
  photoStatus: string | null;
  dismissRefusal: () => void;
  valueRef: NonNullable<ComponentProps<typeof MeasureForm>["focusRef"]>;
  invalidate: () => void;
  onBack: () => void;
};

/** The loaded page: the fact line, the form under the growth note and the course layer (issue 1644, US-ACH-05). */
function MeasuredView(props: MeasuredProps) {
  const {
    view,
    api,
    token,
    specimen,
    course,
    moments,
    justSaved,
    saves,
    send,
    valueRef,
    photoStatus,
  } = props;
  return (
    <>
      <MeasurementHeader
        view={view}
        action={<LayerOpener id={course}>Messverlauf ({view.measurements.length})</LayerOpener>}
      />
      <GrowthNoteLayer note={growthNoteText({ moments, justSaved })} saves={saves}>
        <MeasureForm
          unit="cm"
          signs={view.etiolationSigns}
          onSend={send}
          focusRef={valueRef}
          photoStatus={photoStatus}
          onCancel={props.onBack}
          onDismissRefusal={props.dismissRefusal}
        />
      </GrowthNoteLayer>
      <CourseLayer
        id={course}
        name={specimen.name}
        view={view}
        photo={{ api, token, specimenId: specimen.id }}
        records={moments?.records}
        onPhotoSaved={props.invalidate}
      />
    </>
  );
}

export function MeasurePage(props: MeasurePageProps) {
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
  const { send, saved, saves, confirmed, photoStatus, dismissRefusal } = useMeasureSend({
    api,
    token,
    specimenId: specimen.id,
    invalidate,
    say,
    ...(props.onSaved ? { onSaved: props.onSaved } : {}),
  });
  const moments = useGrowthMoments(api, token, specimen.id);
  // One announcement per save: the confirmation with its growth note (US-QS-08, issue 2323).
  useSaveAnnouncement({ saves, confirmed, moments, say });
  return (
    <section aria-labelledby="measure-title" className="flex min-w-0 flex-col gap-3">
      <PageHeader
        headingId="measure-title"
        title={ui("title")}
        subject={specimen.name}
        back={{ label: ui("back", { name: specimen.name }), onBack: props.onBack }}
      />
      <LoadFrame
        queryKey={key}
        token={token}
        load={load}
        loadingText={LOADING}
        loadingFallback={<MeasurePageSkeleton label={LOADING} />}
      >
        {(view) => (
          <MeasuredView
            view={view}
            api={api}
            token={token}
            specimen={specimen}
            course={course}
            moments={moments}
            justSaved={Boolean(saved)}
            saves={saves}
            send={send}
            photoStatus={photoStatus}
            dismissRefusal={dismissRefusal}
            valueRef={valueRef}
            invalidate={invalidate}
            onBack={props.onBack}
          />
        )}
      </LoadFrame>
    </section>
  );
}
