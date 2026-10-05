import type { TreatmentRow } from "@pflanzendex/core";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { LoadError, SIGN_IN, type ApiError } from "../kernel";
import { CARD_CLASSES, LIST_CLASSES } from "./notices";
import { dateText } from "./text";
import { TreatmentHistorySkeleton } from "./treatment-history.skeleton";
import { loadTreatmentHistory, type TreatableSpecimen } from "./treatments-api";

type Token = () => Promise<string | undefined>;
type Data =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "da"; rows: readonly TreatmentRow[] };

/** Loads the done treatments of the chosen specimen; again whenever `version` changes (after a tick-off). */
function useHistory(api: string, token: Token, specimenId: string, version: number): Data {
  const [data, setData] = useState<Data>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await token();
      const r = t
        ? await loadTreatmentHistory(api, t, specimenId)
        : { ok: false as const, error: SIGN_IN };
      if (current)
        setData(r.ok ? { kind: "da", rows: r.value } : { kind: "error", error: r.error });
    })();
    return () => {
      current = false;
    };
  }, [api, token, specimenId, version]);
  return data;
}

function Entry({ row }: { row: TreatmentRow }) {
  return (
    <li className={CARD_CLASSES}>
      <h3 className="font-semibold">{row.reason}</h3>
      <p className="text-muted-foreground">Mittel: {row.agent ?? "—"}</p>
      <p className="text-muted-foreground">Fällig am: {dateText(row.dueAt)}</p>
      <p className="text-muted-foreground">
        Erledigt am: {row.doneAt ? dateText(row.doneAt) : "unbekannt"}
      </p>
    </li>
  );
}

function History(props: {
  api: string;
  token: Token;
  specimen: string;
  version: number;
  /** Moves the focus back to the choice of the specimen. */
  onChoose: () => void;
}) {
  const [reload, setReload] = useState(0);
  const data = useHistory(props.api, props.token, props.specimen, props.version + reload);
  if (data.kind === "loading") return <TreatmentHistorySkeleton label="Verlauf wird geladen …" />;
  if (data.kind === "error")
    return <LoadError error={data.error} onReload={() => setReload((n) => n + 1)} />;
  if (data.rows.length === 0)
    return (
      <EmptyState
        title="Noch keine erledigte Behandlung für dieses Exemplar."
        description="Hake oben einen offenen Termin mit „Erledigt“ ab, dann erscheint er hier."
        action={{ label: "Anderes Exemplar wählen", onClick: props.onChoose }}
      />
    );
  return (
    <ul className={LIST_CLASSES} aria-label="Erledigte Behandlungen">
      {data.rows.map((row) => (
        <Entry key={row.id} row={row} />
      ))}
    </ul>
  );
}

/**
 * The completed treatments of one specimen (US-BEH-03: they remain as history). Nothing is loaded before a specimen
 * is chosen; the view says what to do (P-09).
 */
export function TreatmentHistory(props: {
  api: string;
  token: Token;
  specimens: readonly TreatableSpecimen[];
  version: number;
}) {
  const [specimen, setSpecimen] = useState("");
  const choice = useRef<HTMLSelectElement>(null);
  return (
    <section aria-labelledby="treatment-history-title" className="flex flex-col gap-3">
      <h2 id="treatment-history-title" className="text-xl font-semibold">
        Erledigte Behandlungen
      </h2>
      <div className="flex max-w-xl flex-col gap-2">
        <Label htmlFor="history-specimen">Exemplar für den Verlauf</Label>
        <Select
          id="history-specimen"
          ref={choice}
          value={specimen}
          onChange={(e) => setSpecimen(e.target.value)}
        >
          <option value="">Exemplar wählen …</option>
          {props.specimens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      {specimen === "" ? (
        <p className="text-muted-foreground">
          Wähle ein Exemplar, um erledigte Behandlungen zu sehen.
        </p>
      ) : (
        <History
          api={props.api}
          token={props.token}
          specimen={specimen}
          version={props.version}
          onChoose={() => choice.current?.focus()}
        />
      )}
    </section>
  );
}
