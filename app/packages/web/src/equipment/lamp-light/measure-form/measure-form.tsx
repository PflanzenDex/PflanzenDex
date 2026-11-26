import { useState } from "react";
import { localToday } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { FormRoot } from "@/shared/ui/form";
import { Input } from "@/shared/ui/input";
import { DateField } from "@/shared/ui/input.date-field";
import { isHandedDate } from "@/shared/ui/input.date-schema";
import { currentTimeZone } from "../../../shared/data";
import type { MeasurementInput } from "../../equipment-api";
import { wholeNumber } from "../parse";

const LABEL = "flex min-w-0 flex-col gap-1 text-sm";

/** Checks the fields and builds the input, or names what to fix. */
function toInput(
  date: string,
  luxText: string,
  distance: string,
  method: string,
): { input: MeasurementInput } | { problem: string } {
  const value = wholeNumber(luxText);
  const cm = wholeNumber(distance);
  if (value === null || Number.isNaN(value) || value < 1)
    return { problem: "Gib die Lux-Messung als ganze Zahl an." };
  if (cm !== null && (Number.isNaN(cm) || cm < 1))
    return { problem: "Der Abstand ist eine ganze Zahl in Zentimetern." };
  const trimmed = method.trim();
  return {
    input: {
      measuredOn: date,
      lux: value,
      ...(cm !== null ? { distanceCm: cm } : {}),
      ...(trimmed ? { method: trimmed } : {}),
    },
  };
}

/** The four fields of a measurement; the units stand inside the fields as suffixes (SG-FORM-01). */
function MeasureFields(props: {
  date: string;
  onDate: (value: string) => void;
  lux: string;
  onLux: (value: string) => void;
  distance: string;
  onDistance: (value: string) => void;
  method: string;
  onMethod: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className={LABEL}>
        Datum
        <DateField value={props.date} onChange={(e) => props.onDate(e.target.value)} required />
      </label>
      <label className={LABEL}>
        Lichtstärke
        <Input
          inputMode="numeric"
          value={props.lux}
          suffix="lx"
          onChange={(e) => props.onLux(e.target.value)}
        />
      </label>
      <label className={LABEL}>
        Abstand (optional)
        <Input
          inputMode="numeric"
          value={props.distance}
          suffix="cm"
          onChange={(e) => props.onDistance(e.target.value)}
        />
      </label>
      <label className={LABEL}>
        Methode (optional)
        <Input
          value={props.method}
          maxLength={60}
          onChange={(e) => props.onMethod(e.target.value)}
        />
      </label>
    </div>
  );
}

/**
 * Adds one measurement of a lamp (US-EQU-03): date (today, in the keeper's time zone, NFR-08) and lux are required,
 * distance and method may stay empty (unknown, P-08). The server validates again (P-03).
 */
type MeasureFormProps = {
  lampName: string;
  busy: boolean;
  onSend: (input: MeasurementInput) => Promise<boolean>;
};

export function MeasureForm(props: MeasureFormProps) {
  const [date, setDate] = useState(() => localToday(new Date(), currentTimeZone()));
  const [luxText, setLuxText] = useState("");
  const [distance, setDistance] = useState("");
  const [method, setMethod] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isHandedDate(date)) return; // no real day: its field says so on leaving it (US-QS-32)
    const checked = toInput(date, luxText, distance, method);
    if ("problem" in checked) return setProblem(checked.problem);
    setProblem(null);
    if (await props.onSend(checked.input)) {
      setLuxText("");
      setDistance("");
      setMethod("");
    }
  };
  return (
    <FormRoot
      onSubmit={submit}
      aria-label={`Messung für ${props.lampName}`}
      className="flex flex-col gap-2"
    >
      <MeasureFields
        date={date}
        onDate={setDate}
        lux={luxText}
        onLux={setLuxText}
        distance={distance}
        onDistance={setDistance}
        method={method}
        onMethod={setMethod}
      />
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="tinted" size="touch" disabled={props.busy}>
        Messung sichern
      </Button>
    </FormRoot>
  );
}
