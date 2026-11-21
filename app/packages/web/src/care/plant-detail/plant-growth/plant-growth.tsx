import { useCallback, useMemo } from "react";
import { LoadFrame } from "../../../shared/data";
import { texts } from "@/shared/lib/text-rules/texts";
import { loadMeasurementView } from "../../shared/api/measurements-api";
import { GrowthFrame, GrowthLines } from "./growth-frame/growth-frame";
import table from "./plant-growth.de.json";

type Token = () => Promise<string | undefined>;

const t = texts(table);

/**
 * The growth trend of one plant for the overview of the plant layer (US-QS-23). It shares the data of the measure page,
 * so a new measurement shows here at once; it says that it loads, and why it failed with a way to retry (P-10). The line
 * keeps the height of its longest reading in every state (`GrowthFrame`, US-QS-32), or of its one reading while the plant
 * has no measurement (`measured` false, US-QS-23).
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
        {(view) => <GrowthLines growth={view.growth} />}
      </LoadFrame>
    </GrowthFrame>
  );
}
