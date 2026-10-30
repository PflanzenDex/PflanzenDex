import { useState } from "react";
import { localToday } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { FormRoot } from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { currentTimeZone } from "../../../../kernel";
import type { EquipmentRow } from "../../../equipment-api";
import type { MaintenanceInput } from "../../../upkeep-api";
import { wholeNumber } from "../../../lamp-light/parse";
import { keepTogether } from "@/lib/format";

const LABEL = "flex min-w-0 flex-col gap-1 text-sm";
const UNKNOWN = "unbekannt";

export interface MaintenanceActions {
  busy: boolean;
  onSave: (item: EquipmentRow, input: MaintenanceInput) => void;
  onChecked: (item: EquipmentRow, checkedOn: string) => void;
}

const blank = (text: string): string | null => text.trim() || null;

/** Builds the input from the form fields, or names what to fix. */
function toInput(f: Record<"since" | "interval" | "value" | "source", string>) {
  const interval = wholeNumber(f.interval);
  if (Number.isNaN(interval) || (interval !== null && (interval < 1 || interval > 3650)))
    return { problem: "Das Prüfintervall ist eine ganze Zahl von 1 bis 3650 Tagen." };
  const value = blank(f.value);
  const source = blank(f.source);
  if ((value === null) !== (source === null))
    return { problem: "Eine Lebensdauer-Angabe braucht ihre Quelle, und umgekehrt." };
  const input: MaintenanceInput = {
    inOperationSince: blank(f.since),
    checkIntervalDays: interval,
    lifetimeValue: value,
    lifetimeSource: source,
  };
  return { input };
}

function Values({ item }: { item: EquipmentRow }) {
  const lifetime =
    item.lifetimeValue === null
      ? UNKNOWN
      : `${item.lifetimeValue} (Herstellerangabe, Quelle: ${item.lifetimeSource ?? UNKNOWN})`;
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm tabular-nums">
      <dt>In Betrieb seit</dt>
      <dd className="m-0">{item.inOperationSince ?? UNKNOWN}</dd>
      <dt>Prüfintervall</dt>
      <dd className="m-0">
        {item.checkIntervalDays === null
          ? "keins gesetzt"
          : keepTogether(`alle ${item.checkIntervalDays} Tage`)}
      </dd>
      <dt>Zuletzt geprüft</dt>
      <dd className="m-0">{item.lastCheckedOn ?? "noch nie"}</dd>
      <dt>Lebensdauer</dt>
      <dd className="m-0 break-words">{lifetime}</dd>
    </dl>
  );
}

function MaintenanceForm(props: { item: EquipmentRow; actions: MaintenanceActions }) {
  const { item } = props;
  const [since, setSince] = useState(item.inOperationSince ?? "");
  const [interval, setInterval] = useState(item.checkIntervalDays?.toString() ?? "");
  const [value, setValue] = useState(item.lifetimeValue ?? "");
  const [source, setSource] = useState(item.lifetimeSource ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const checked = toInput({ since, interval, value, source });
    if ("problem" in checked) return setProblem(checked.problem);
    setProblem(null);
    props.actions.onSave(item, checked.input);
  };
  return (
    <FormRoot
      onSubmit={submit}
      aria-label={`Betriebsdaten für ${item.name}`}
      className="mt-2 flex flex-col gap-2"
    >
      <div className="grid grid-cols-2 gap-2">
        <label className={LABEL}>
          In Betrieb seit (optional)
          <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        </label>
        <label className={LABEL}>
          Prüfintervall in Tagen (optional)
          <Input
            inputMode="numeric"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          />
        </label>
        <label className={LABEL}>
          Lebensdauer laut Hersteller (optional)
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label className={LABEL}>
          Quelle der Lebensdauer
          <Input value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <Button type="submit" size="touch" variant="secondary" disabled={props.actions.busy}>
        Betriebsdaten speichern
      </Button>
    </FormRoot>
  );
}

/**
 * Operation and maintenance of a device (US-EQU-04): what the keeper entered and the manufacturer's lifetime with its
 * source; what is missing reads "unbekannt", no wear value is invented (P-08). "Jetzt geprüft" restarts the interval.
 * A consumable has none of this.
 */
export function Maintenance(props: { item: EquipmentRow; actions: MaintenanceActions }) {
  const { item, actions } = props;
  if (item.status === null) return null;
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer">Betrieb und Wartung</summary>
      <div className="mt-2 flex flex-col gap-2">
        <Values item={item} />
        <Button
          type="button"
          size="touch"
          variant="secondary"
          disabled={actions.busy}
          aria-label={`Jetzt geprüft: ${item.name}`}
          onClick={() => actions.onChecked(item, localToday(new Date(), currentTimeZone()))}
        >
          Jetzt geprüft
        </Button>
        <MaintenanceForm
          key={`${item.id}:${item.checkIntervalDays}:${item.lifetimeValue}`}
          item={item}
          actions={actions}
        />
      </div>
    </details>
  );
}
