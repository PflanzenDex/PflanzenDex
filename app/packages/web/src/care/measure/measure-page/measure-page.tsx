import { useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { LoadFrame, useInvalidate } from "../../../kernel";
import { MeasureForm } from "../measure-form/measure-form";
import { MeasurementList } from "../measurement-list/measurement-list";
import { loadMeasurementView } from "../../shared/api/measurements-api";
import { MeasurementHeader } from "../measurement-header/measurement-header";
import { MeasurePageSkeleton } from "./measure-page.skeleton";
import { useMeasureSend } from "../measurement-header/measurement-photo";
import { RefusalAlert, StatusNote } from "../../shared/notices/notices";

type Token = () => Promise<string | undefined>;

/**
 * Measure (US-WAC-01): what to measure, last measurement, last rating, input form (quality with the etiolation signs
 * of the species, US-WAC-02) and course of a specimen. Every view says what to do next (P-09).
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
  const loading = "Messungen werden geladen …";
  return (
    <section aria-labelledby="measure-title" className="flex min-w-0 flex-col gap-4">
      <h1 id="measure-title" className="text-2xl font-semibold [overflow-wrap:anywhere]">
        Messen: {specimen.name}
      </h1>
      <LoadFrame
        queryKey={key}
        token={token}
        load={load}
        loadingText={loading}
        loadingFallback={<MeasurePageSkeleton label={loading} />}
      >
        {(view) => (
          <>
            <MeasurementHeader view={view} />
            {saved && <StatusNote>Gespeichert: {saved}.</StatusNote>}
            {photoRefusal && <RefusalAlert error={photoRefusal} />}
            <MeasureForm unit="cm" signs={view.etiolationSigns} onSend={send} focusRef={valueRef} />
            <MeasurementList
              measurements={view.measurements}
              photo={{ api, token, specimenId: specimen.id }}
              onPhotoSaved={invalidate}
              onAdd={() => valueRef.current?.focus()}
            />
          </>
        )}
      </LoadFrame>
      <Button type="button" variant="secondary" size="touch" onClick={props.onBack}>
        Zurück zum Bestand
      </Button>
    </section>
  );
}
