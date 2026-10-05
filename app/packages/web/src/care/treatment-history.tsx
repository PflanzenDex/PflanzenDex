import type { TreatmentRow } from "@pflanzendex/core";
import { useCallback, useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { LoadFrame } from "../kernel";
import { historyKey } from "./api/query-keys";
import { CARD_CLASSES, LIST_CLASSES } from "./notices";
import { dateText } from "./text";
import { TreatmentHistorySkeleton } from "./treatment-history.skeleton";
import { loadTreatmentHistory, type TreatableSpecimen } from "./treatments-api";

type Token = () => Promise<string | undefined>;
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
  /** Moves the focus back to the choice of the specimen. */
  onChoose: () => void;
}) {
  const { api, token, specimen } = props;
  const load = useCallback((t: string) => loadTreatmentHistory(api, t, specimen), [api, specimen]);
  const key = useMemo(() => historyKey(specimen), [specimen]);
  return (
    <LoadFrame
      queryKey={key}
      token={token}
      load={load}
      loadingText="Verlauf wird geladen …"
      loadingFallback={<TreatmentHistorySkeleton label="Verlauf wird geladen …" />}
      empty={{
        isEmpty: (rows: readonly TreatmentRow[]) => rows.length === 0,
        title: "Noch keine erledigte Behandlung für dieses Exemplar.",
        description: "Hake oben einen offenen Termin mit „Erledigt“ ab, dann erscheint er hier.",
        action: { label: "Anderes Exemplar wählen", onClick: props.onChoose },
      }}
    >
      {(rows: readonly TreatmentRow[]) => (
        <ul className={LIST_CLASSES} aria-label="Erledigte Behandlungen">
          {rows.map((row) => (
            <Entry key={row.id} row={row} />
          ))}
        </ul>
      )}
    </LoadFrame>
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
          onChoose={() => choice.current?.focus()}
        />
      )}
    </section>
  );
}
