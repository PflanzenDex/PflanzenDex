import { useEffect, useState } from "react";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { loadLocations } from "../light";
import { LoadError, type ApiError } from "../kernel";
import { PhasesList } from "./phases-list";
import { loadCarePhases } from "./care-phases-api";

type Token = () => Promise<string | undefined>;
const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };
type Data =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "da"; rows: readonly PhasesRow[]; locations: readonly LightLocation[] };

/** Care phases (US-PHA-01): loads phases and locations; if one fails, the loading fails as a whole. */
export function CarePhasesPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<Data>({ kind: "loading" });
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
      {data.kind === "error" && (
        <LoadError error={data.error} onReload={() => setReload((n) => n + 1)} />
      )}
      {data.kind === "da" && <PhasesList rows={data.rows} locations={data.locations} />}
    </div>
  );
}
