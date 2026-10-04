import { useCallback, useEffect, useState } from "react";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { loadLocations } from "../light";
import { LoadError, SIGN_IN, type ApiError } from "../kernel";
import { PhasesList } from "./phases-list";
import { loadCarePhases } from "./care-phases-api";
import { usePhaseSwitch } from "./use-phase-switch";

type Token = () => Promise<string | undefined>;
type Data =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "da"; rows: readonly PhasesRow[]; locations: readonly LightLocation[] };

/**
 * Care phases (US-PHA-01) with "Jetzt umgestellt" (US-PHA-03): loads phases and locations; if one fails, the loading
 * fails as a whole. After a confirmation the list is loaded again, so the rows show the new location at once.
 */
export function CarePhasesPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<Data>({ kind: "loading" });
  const again = useCallback(() => setReload((n) => n + 1), []);
  const move = usePhaseSwitch(api, token, again);
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      if (!t) return current && setData({ kind: "error", error: SIGN_IN });
      const [p, s] = await Promise.all([loadCarePhases(api, t), loadLocations(api, t)]);
      if (!current) return;
      if (!p.ok) return setData({ kind: "error", error: p.error });
      if (!s.ok) return setData({ kind: "error", error: s.error });
      setData({ kind: "da", rows: p.value, locations: s.value });
    })();
    return () => {
      current = false;
    };
  }, [api, token, reload]);
  return (
    <div className="light collection">
      {data.kind === "loading" && <p role="status">Pflegephasen werden geladen …</p>}
      {data.kind === "error" && <LoadError error={data.error} onReload={again} />}
      {data.kind === "da" && (
        <>
          {move.message && (
            <p role="status" className="hint">
              {move.message}
            </p>
          )}
          {move.error && (
            <div role="alert" className="warning">
              <p>{move.error.text}</p>
            </div>
          )}
          <PhasesList
            rows={data.rows}
            locations={data.locations}
            busy={move.running}
            onConfirm={(ids, text) => void move.confirm(ids, text)}
          />
        </>
      )}
    </div>
  );
}
