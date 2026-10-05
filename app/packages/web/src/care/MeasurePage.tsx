import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadFrame, SIGN_IN, useInvalidate, type ApiError } from "../kernel";
import { MeasureForm } from "./measure-form";
import { MeasurementList } from "./measurement-list";
import {
  recordMeasurement,
  loadMeasurementView,
  type MeasurementInput,
} from "./api/measurements-api";
import { MeasurementHeader } from "./measurement-header";
import { MeasurePageSkeleton } from "./MeasurePage.skeleton";
import { StatusNote } from "./notices";
import { measurementText } from "./text";

type Token = () => Promise<string | undefined>;

/**
 * Measure (US-WAC-01): what to measure, last measurement, last rating, input form and course of a specimen. Rate and
 * trend are still missing (US-WAC-03). Every view says what to do next (P-09).
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
  const [saved, setSaved] = useState<string | null>(null);
  const valueRef = useRef<HTMLInputElement | null>(null);
  const load = useCallback(
    (t: string) => loadMeasurementView(api, t, specimen.id),
    [api, specimen.id],
  );
  const send = useCallback(
    async (input: MeasurementInput): Promise<ApiError | null> => {
      const t = await token();
      if (!t) return SIGN_IN;
      const r = await recordMeasurement({ api, token: t }, specimen.id, input);
      if (!r.ok) return r.error;
      setSaved(measurementText(r.value));
      invalidate();
      return null;
    },
    [api, token, specimen.id, invalidate],
  );
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
            <MeasureForm unit="cm" onSend={send} focusRef={valueRef} />
            <MeasurementList
              measurements={view.measurements}
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
