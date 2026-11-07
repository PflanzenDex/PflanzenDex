// The date of the latest fertilizing of a plant on its pot label (US-MON-09, P-08, P-09): one line under the quick
// actions. A failed read says why and offers a retry (P-10); the line keeps its place while it loads.
import type { FertilizingView } from "@pflanzendex/core";
import { loadLastFertilized } from "@/monitoring";
import { useRequest } from "@/shared/data";
import { errorText } from "@/shared/lib/error-text";
import { dateText } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import table from "../pot-label-page.de.json";

type Token = () => Promise<string | undefined>;
const ui = texts(table);

export function LastFertilized(props: { api: string; token: Token; specimenId: string }) {
  const { api, token, specimenId } = props;
  const last = useRequest<FertilizingView>({
    queryKey: ["monitoring", "fertilizing", specimenId],
    token,
    load: (t) => loadLastFertilized(api, t, specimenId),
  });
  const date = last.value?.lastFertilizedOn;
  return (
    <RequestState
      status={last.status}
      {...(last.error ? { errorText: errorText(last.error.code) } : {})}
      onRetry={last.retry}
      offline={last.offline}
      skeleton={<p aria-hidden="true" className="min-h-5 text-sm" />}
    >
      <p className="text-sm">
        {date === undefined
          ? null
          : date === null
            ? ui("neverFertilized")
            : ui("lastFertilized", { date: dateText(date) })}
      </p>
    </RequestState>
  );
}
