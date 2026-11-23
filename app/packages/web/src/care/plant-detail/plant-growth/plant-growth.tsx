import { useCallback, useMemo } from "react";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { texts } from "@/shared/lib/text-rules/texts";
import { loadMeasurementView } from "../../shared/api/measurements-api";
import { GrowthFrame, GrowthLines } from "./growth-frame/growth-frame";
import table from "./plant-growth.de.json";

type Token = () => Promise<string | undefined>;

const t = texts(table);

/**
 * The growth trend of one plant for the overview of the plant layer (US-QS-23). It shares the data of the measure page,
 * so a new measurement shows here at once; it says that it loads, and why it failed with a way to retry (P-10). The line
 * keeps the height of its longest reading in every state (`GrowthFrame`, US-QS-32). While the card says the plant has no
 * measurement (`measured` false, US-QS-23, issue 2384) it keeps one line instead, and the error state is the exception
 * that grows it. The card flag decides the first render only: a loaded trend that counts measurements (the card was behind)
 * gets the full reserve of its own frame.
 */
export function PlantGrowth(props: {
  api: string;
  token: Token;
  specimenId: string;
  measured?: boolean;
}) {
  const { api, token, specimenId } = props;
  const key = useMemo(() => ["care", "measurements", specimenId], [specimenId]);
  const load = useCallback(
    (accessToken: string) => loadMeasurementView(api, accessToken, specimenId),
    [api, specimenId],
  );
  const loading = t("loading");
  return (
    <GrowthFrame measured={props.measured ?? true}>
      <LoadFrame
        queryKey={key}
        token={token}
        load={load}
        loadingText={loading}
        loadingStatus={
          <p role="status" className="text-sm text-muted-foreground">
            {loading}
          </p>
        }
      >
        {(view) =>
          props.measured === false && view.growth.count > 0 ? (
            <GrowthFrame>
              <GrowthLines growth={view.growth} />
            </GrowthFrame>
          ) : (
            <GrowthLines growth={view.growth} />
          )
        }
      </LoadFrame>
    </GrowthFrame>
  );
}
