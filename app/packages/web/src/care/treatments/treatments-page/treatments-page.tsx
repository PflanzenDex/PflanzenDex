import { useCallback, useRef, useState, type ReactNode } from "react";
import { OpenCount as OpenCountOf, type OpenCount } from "../../shared/api/open-count/open-count";
import { useInvalidate, useRequest } from "../../../kernel";
import { OPEN_KEY, SPECIMENS_KEY } from "../../shared/api/query-keys";
import { OpenTreatments } from "../open-treatments/open-treatments";
import { TreatmentHistory } from "../treatment-history/treatment-history";
import { Planning, usePlanning } from "../planning/planning";
import { loadTreatableSpecimens } from "../../shared/api/treatments-api";
import { Button } from "@/components/ui/button/button";
import { SegmentedControl } from "@/components/segmented-control/segmented-control";

type Token = () => Promise<string | undefined>;
type View = "open" | "done";
const VIEWS = [
  { value: "open", label: "Offen" },
  { value: "done", label: "Erledigt" },
] as const;

/**
 * Treatments: the open dates by urgency with "Erledigt" (US-BEH-02, US-BEH-03), the form to plan new ones, one date or
 * a course (US-BEH-01), and the done ones per specimen as history (US-BEH-03).
 * Every view says what to do next (P-09): without a specimen it points to the collection, after saving the list above
 * shows the new date. With `host` (a layer of "Heute", US-QS-14) there is no title of its own, the headings are one
 * level lower, the open and the done treatments are one segment each (US-QS-18), and planning opens the planning layer
 * through `onPlan` (US-BEH-01, the layer owns the form).
 */
export function TreatmentsPage(props: {
  api: string;
  token: Token;
  host?: boolean;
  /** With the host: opens the planning layer (`?sheet=plan`, US-QS-18). */
  onPlan?: () => void;
  /** With `count` the page renders nothing of its own and hands the open count to it (US-QS-18). */
  count?: (open: OpenCount) => ReactNode;
}) {
  const { count, ...page } = props;
  if (count)
    return (
      <OpenCountOf api={props.api} token={props.token}>
        {count}
      </OpenCountOf>
    );
  return <TreatmentsList {...page} />;
}

function TreatmentsList(props: { api: string; token: Token; host?: boolean; onPlan?: () => void }) {
  const { api, token } = props;
  const host = props.host === true;
  const firstField = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<View>("open");
  const load = useCallback((t: string) => loadTreatableSpecimens(api, t), [api]);
  const request = useRequest({ queryKey: SPECIMENS_KEY, token, load });
  // The list of open treatments loads again after every successful plan (US-BEH-02).
  const onPlanned = useInvalidate(OPEN_KEY);
  const planning = usePlanning(api, token, () => onPlanned());
  const specimens = request.value ?? [];
  const canPlan = specimens.length > 0;
  const plan = host ? () => props.onPlan?.() : () => firstField.current?.focus();
  const next = canPlan
    ? { label: "Behandlung planen", onClick: plan }
    : { label: "Zur Sammlung", href: "/collection" };
  if (host)
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <SegmentedControl
          label="Behandlungen anzeigen"
          options={VIEWS}
          value={view}
          onChange={setView}
        />
        {view === "open" ? (
          <>
            <OpenTreatments api={api} token={token} host next={next} />
            {canPlan && (
              <Button
                type="button"
                variant="outline"
                className="self-start rounded-full"
                onClick={plan}
              >
                Behandlung planen
              </Button>
            )}
          </>
        ) : (
          <TreatmentHistory api={api} token={token} specimens={specimens} host />
        )}
      </div>
    );
  return (
    <section aria-labelledby="treatments-title" className="flex min-w-0 flex-col gap-6">
      <h1 id="treatments-title" className="text-2xl font-semibold">
        Behandlung
      </h1>
      <OpenTreatments api={api} token={token} next={next} />
      <section aria-labelledby="plan-title" className="flex flex-col gap-3">
        <h2 id="plan-title" className="text-xl font-semibold">
          Behandlung planen
        </h2>
        <Planning request={request} planning={planning} focusRef={firstField} />
      </section>
      {canPlan && <TreatmentHistory api={api} token={token} specimens={specimens} />}
    </section>
  );
}
