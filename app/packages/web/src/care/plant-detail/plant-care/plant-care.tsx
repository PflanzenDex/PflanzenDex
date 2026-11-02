import { useCallback, useState } from "react";
import type { TreatmentListRow, TreatmentRow } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../kernel";
import {
  completeTreatment,
  loadOpenTreatments,
  loadTreatmentHistory,
} from "../../shared/api/treatments-api";
import { historyKey, OPEN_KEY, TREATMENTS } from "../../shared/api/query-keys";
import { RefusalAlert, StatusNote } from "../../shared/notices/notices";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { dateText } from "../../shared/text";
import { OpenRow } from "./open-row/open-row";
import { usePlanning } from "../../treatments/planning/planning";
import { PhaseOfPlant } from "../plant-phase/plant-phase";
import { TreatmentForm } from "../../treatments/treatment-form/treatment-form";

type Token = () => Promise<string | undefined>;
type Specimen = { id: string; name: string };

const Loading = ({ text }: { text: string }) => (
  <p role="status" className="text-sm text-muted-foreground">
    {text}
  </p>
);

/** The address parts of the two lists of the layer: each list keeps its own page (US-QS-23, US-QS-15). */
const OPEN_PARAM = "offen";
const DONE_PARAM = "erledigt";

/** The open treatments of this plant with "Erledigt" (US-BEH-02, US-BEH-03). */
function OpenTreatmentsOfPlant(props: { api: string; token: Token; specimen: Specimen }) {
  const { api, token, specimen } = props;
  const again = useInvalidate(TREATMENTS);
  const write = useWriteAction(token, again);
  const load = useCallback((t: string) => loadOpenTreatments(api, t), [api]);
  return (
    <>
      {write.message ? <StatusNote>{write.message}</StatusNote> : null}
      {write.error ? <RefusalAlert error={write.error} /> : null}
      <LoadFrame
        queryKey={OPEN_KEY}
        token={token}
        load={load}
        loadingText="Offene Behandlungen werden geladen …"
        loadingFallback={<Loading text="Offene Behandlungen werden geladen …" />}
      >
        {(all: readonly TreatmentListRow[]) => {
          const rows = all.filter((r) => r.specimenId === specimen.id);
          if (rows.length === 0) return <p className="text-sm">Keine offene Behandlung.</p>;
          return (
            <Pager
              items={rows}
              pageSize={1}
              label="Offene Behandlungen"
              param={OPEN_PARAM}
              replace
              getKey={(row) => row.id}
              renderItem={(row) => (
                <OpenRow
                  row={row}
                  busy={write.running}
                  onDone={() =>
                    void write.run(
                      (t) => completeTreatment(api, t, row.id),
                      `„${row.reason}“ bei „${row.specimenName}“ als erledigt eingetragen.`,
                    )
                  }
                />
              )}
            />
          );
        }}
      </LoadFrame>
    </>
  );
}

/** The done treatments of this plant, newest first (US-BEH-03). */
function DoneTreatments(props: { api: string; token: Token; specimenId: string }) {
  const { api, token, specimenId } = props;
  const load = useCallback(
    (t: string) => loadTreatmentHistory(api, t, specimenId),
    [api, specimenId],
  );
  return (
    <LoadFrame
      queryKey={historyKey(specimenId)}
      token={token}
      load={load}
      loadingText="Erledigte Behandlungen werden geladen …"
      loadingFallback={<Loading text="Erledigte Behandlungen werden geladen …" />}
    >
      {(rows: readonly TreatmentRow[]) =>
        rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine erledigte Behandlung.</p>
        ) : (
          <Pager
            items={rows}
            pageSize={3}
            label="Erledigte Behandlungen"
            param={DONE_PARAM}
            replace
            listClassName="gap-1 text-sm"
            getKey={(row) => row.id}
            renderItem={(row) => (
              <>
                {row.reason} · erledigt am {row.doneAt ? dateText(row.doneAt) : "unbekannt"}
              </>
            )}
          />
        )
      }
    </LoadFrame>
  );
}

/** "Behandlung planen" for this plant, ticked at the start (US-BEH-01); the form closes after a save. */
function PlanTreatment({
  api,
  token,
  specimen,
}: {
  api: string;
  token: Token;
  specimen: Specimen;
}) {
  const [open, setOpen] = useState(false);
  const planning = usePlanning(api, token, useInvalidate(TREATMENTS));
  const send: typeof planning.send = async (input) => {
    const ok = await planning.send(input);
    if (ok) setOpen(false);
    return ok;
  };
  return (
    <div className="grid gap-2">
      {planning.message ? <StatusNote>{planning.message}</StatusNote> : null}
      {planning.error ? <RefusalAlert error={planning.error} /> : null}
      {open ? (
        <TreatmentForm
          specimens={[specimen]}
          chosen={[specimen.id]}
          running={planning.running}
          onSend={send}
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Planen abbrechen" : "Behandlung planen"}
      </Button>
    </div>
  );
}

/**
 * "Pflege" of the plant layer (US-QS-23): the open treatments with "Erledigt", the planning, the done ones, and the care
 * phase with "Jetzt umgestellt". All of it reuses the existing reads and writes (P-03); each part loads and fails on its
 * own, so one broken request does not hide the others (P-10).
 */
export function PlantCare(props: { api: string; token: Token; specimen: Specimen }) {
  const { api, token, specimen } = props;
  return (
    <div className="grid gap-4">
      <section aria-labelledby="care-treatments" className="grid gap-2">
        <h3 id="care-treatments" className="sr-only">
          Behandlungen
        </h3>
        <OpenTreatmentsOfPlant api={api} token={token} specimen={specimen} />
        <PlanTreatment api={api} token={token} specimen={specimen} />
        <DoneTreatments api={api} token={token} specimenId={specimen.id} />
      </section>
      <section aria-labelledby="care-phase" className="grid gap-2">
        <h3 id="care-phase" className="sr-only">
          Pflegephase
        </h3>
        <PhaseOfPlant api={api} token={token} specimenId={specimen.id} />
      </section>
    </div>
  );
}
