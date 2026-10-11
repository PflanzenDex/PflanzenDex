import { useCallback, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Button } from "@/components/ui/button/button";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../kernel";
import { loadWateringDue, markWatered, type WateringDueRow } from "../../api/reminders-api";

type Token = () => Promise<string | undefined>;
const KEY = ["monitoring", "watering"] as const;

const sinceText = (d: WateringDueRow) =>
  d.lastWateredOn === null
    ? "noch nie als gegossen eingetragen"
    : `zuletzt vor ${d.daysSince} Tagen gegossen`;

function Row(props: {
  row: WateringDueRow;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onWater: () => void;
}) {
  const r = props.row;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <Checkbox checked={props.checked} onChange={props.onToggle} rowClassName="min-w-0 flex-1">
        <span>
          <span className="font-medium">{r.name}</span>
          <span className="block text-sm text-muted-foreground">
            {sinceText(r)}, Intervall alle {r.intervalDays} Tage
          </span>
        </span>
      </Checkbox>
      <Button
        variant="outline"
        size="sm"
        disabled={props.busy}
        aria-label={`${r.name} als gegossen eintragen`}
        onClick={props.onWater}
      >
        Gegossen
      </Button>
    </li>
  );
}

function Rows(props: { api: string; token: Token; rows: readonly WateringDueRow[] }) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const again = useInvalidate(KEY);
  const write = useWriteAction(props.token, again);
  const toggle = (id: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const water = (ids: readonly string[]) => {
    setChosen(new Set());
    void write.run((t) => markWatered(props.api, t, ids), "Als gegossen eingetragen.");
  };
  const picked = props.rows.filter((r) => chosen.has(r.specimenId)).map((r) => r.specimenId);
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Zu gießen" className="m-0 flex list-none flex-col gap-2 p-0">
        {props.rows.map((r) => (
          <Row
            key={r.specimenId}
            row={r}
            checked={chosen.has(r.specimenId)}
            busy={write.running}
            onToggle={() => toggle(r.specimenId)}
            onWater={() => water([r.specimenId])}
          />
        ))}
      </ul>
      <Button
        size="touch"
        className="self-start"
        disabled={write.running || picked.length < 2}
        onClick={() => water(picked)}
      >
        {picked.length < 2
          ? "Mehrere markieren, dann gemeinsam eintragen"
          : `${picked.length} als gegossen eintragen`}
      </Button>
      {write.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3">
          {write.error.text}
        </p>
      )}
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
    </div>
  );
}

/**
 * The plants that are due to be watered today (US-MON-05): last watering plus the interval of the current phase. The
 * intervals are the keeper's own entries in the care profile; without one a plant is not listed (nothing is invented,
 * P-08), and the empty state says where to set it (P-09). "Gegossen" writes today's entry; several can be marked and
 * entered in one step.
 */
export function WateringList(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadWateringDue(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={KEY}
      token={props.token}
      load={load}
      loadingText="Gießliste wird geladen …"
    >
      {(rows) =>
        rows.length === 0 ? (
          <EmptyState
            level={3}
            title="Heute nichts zu gießen"
            description="Fällig wird eine Pflanze nach dem Gießintervall, das du im Pflegeprofil ihrer Art einträgst. Ohne Intervall erinnert die App nicht ans Gießen."
          />
        ) : (
          <Rows api={props.api} token={props.token} rows={rows} />
        )
      }
    </LoadFrame>
  );
}
