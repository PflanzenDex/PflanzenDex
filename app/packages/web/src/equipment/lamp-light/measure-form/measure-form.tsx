import { useState } from "react";
import { localToday } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { FormRoot } from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { currentTimeZone } from "../../../kernel";
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
    return { problem: "Bitte gib die Lux-Messung als ganze Zahl an." };
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

/**
 * Adds one measurement of a lamp (US-EQU-03): date (today, in the keeper's time zone, NFR-08) and lux are required,
 * distance and method may stay empty (unknown, P-08). The server validates again (P-03).
 */
export function MeasureForm(props: {
  lampName: string;
  busy: boolean;
  onSend: (input: MeasurementInput) => Promise<boolean>;
}) {
  const [date, setDate] = useState(() => localToday(new Date(), currentTimeZone()));
  const [luxText, setLuxText] = useState("");
  const [distance, setDistance] = useState("");
  const [method, setMethod] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
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
      <div className="grid grid-cols-2 gap-2">
        <label className={LABEL}>
          Datum
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className={LABEL}>
          Lux
          <Input inputMode="numeric" value={luxText} onChange={(e) => setLuxText(e.target.value)} />
        </label>
        <label className={LABEL}>
          Abstand in cm (optional)
          <Input
            inputMode="numeric"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
          />
        </label>
        <label className={LABEL}>
          Methode (optional)
          <Input value={method} maxLength={60} onChange={(e) => setMethod(e.target.value)} />
        </label>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <Button type="submit" size="touch" disabled={props.busy}>
        Messung speichern
      </Button>
    </FormRoot>
  );
}
