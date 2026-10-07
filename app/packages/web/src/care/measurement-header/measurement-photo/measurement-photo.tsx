import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { dateText } from "@/lib/format";
import type { ApiError } from "../../../kernel";
import { refusalText } from "../../notices";
import { loadPhoto } from "./photo-api";

type State =
  { kind: "loading" } | { kind: "ready"; url: string } | { kind: "failed"; error: ApiError };

/**
 * The photo of one measurement (US-WAC-05). Photos are private (P-05): the bytes are fetched with the token and shown
 * from an object URL, never from a public link. A failure says why by its error code (P-10).
 */
export function MeasurementPhoto(props: {
  api: string;
  token: () => Promise<string | undefined>;
  specimenId: string;
  measurementId: string;
  date: string;
}) {
  const { api, token, specimenId, measurementId, date } = props;
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    void (async () => {
      const t = await token();
      if (!t)
        return setState({ kind: "failed", error: { code: "access.not_signed_in", text: "" } });
      const r = await loadPhoto({ api, token: t }, specimenId, measurementId);
      if (r.ok) url = r.value;
      if (live)
        setState(r.ok ? { kind: "ready", url: r.value } : { kind: "failed", error: r.error });
      else if (url) URL.revokeObjectURL(url);
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, token, specimenId, measurementId]);
  if (state.kind === "loading")
    return (
      <div role="status">
        <Skeleton className="h-40 w-full max-w-xs" />
        <span className="sr-only">Foto wird geladen …</span>
      </div>
    );
  if (state.kind === "failed")
    return (
      <p role="status" className="text-muted-foreground">
        {refusalText(state.error)}
      </p>
    );
  return (
    <img
      src={state.url}
      alt={`Foto der Messung vom ${dateText(date)}`}
      loading="lazy"
      className="max-h-64 w-auto max-w-full rounded-lg object-contain"
    />
  );
}
