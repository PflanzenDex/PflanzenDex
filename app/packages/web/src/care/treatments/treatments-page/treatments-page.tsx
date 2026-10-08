import { useCallback, useRef, useState } from "react";
import { useInvalidate, useRequest } from "../../../kernel";
import { OPEN_KEY, SPECIMENS_KEY } from "../../shared/api/query-keys";
import { OpenTreatments } from "../open-treatments/open-treatments";
import { StatusNote } from "../../shared/notices/notices";
import { TreatmentHistory } from "../treatment-history/treatment-history";
import { HostPlanning, Planning, usePlanning } from "../planning/planning";
import { loadTreatableSpecimens } from "../../shared/api/treatments-api";

type Token = () => Promise<string | undefined>;
/**
 * Treatments: the open dates by urgency with "Erledigt" (US-BEH-02, US-BEH-03), the form to plan new ones, one date or
 * a course (US-BEH-01), and the done ones per specimen as history (US-BEH-03).
 * Every view says what to do next (P-09): without a specimen it points to the collection, after saving the list above
 * shows the new date. With `host` (a section of "Heute", US-QS-14) there is no title of its own, the headings are one
 * level lower and the form opens in a sheet or dialog.
 */
export function TreatmentsPage(props: { api: string; token: Token; host?: boolean }) {
  const { api, token } = props;
  const host = props.host === true;
  const firstField = useRef<HTMLInputElement | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const load = useCallback((t: string) => loadTreatableSpecimens(api, t), [api]);
  const request = useRequest({ queryKey: SPECIMENS_KEY, token, load });
  // The list of open treatments loads again after every successful plan (US-BEH-02).
  const onPlanned = useInvalidate(OPEN_KEY);
  const planning = usePlanning(api, token, onPlanned);
  const specimens = request.value ?? [];
  const canPlan = specimens.length > 0;
  const plan = host ? () => setPlanOpen(true) : () => firstField.current?.focus();
  const Root = host ? "div" : "section";
  return (
    <Root
      {...(host ? {} : { "aria-labelledby": "treatments-title" })}
      className="flex min-w-0 flex-col gap-6"
    >
      {!host && (
        <h1 id="treatments-title" className="text-2xl font-semibold">
          Behandlung
        </h1>
      )}
      {host && planning.message && <StatusNote>{planning.message}</StatusNote>}
      <OpenTreatments
        api={api}
        token={token}
        host={host}
        next={
          canPlan
            ? { label: "Behandlung planen", onClick: plan }
            : { label: "Zum Bestand", href: "/collection" }
        }
      />
      {host ? (
        <HostPlanning
          canPlan={canPlan}
          onPlan={plan}
          open={planOpen}
          onOpenChange={setPlanOpen}
          request={request}
          planning={planning}
          focusRef={firstField}
        />
      ) : (
        <section aria-labelledby="plan-title" className="flex flex-col gap-3">
          <h2 id="plan-title" className="text-xl font-semibold">
            Behandlung planen
          </h2>
          <Planning request={request} planning={planning} focusRef={firstField} />
        </section>
      )}
      {canPlan && <TreatmentHistory api={api} token={token} specimens={specimens} host={host} />}
    </Root>
  );
}
