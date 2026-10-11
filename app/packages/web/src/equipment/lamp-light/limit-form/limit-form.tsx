import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { FormRoot } from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { wholeNumber } from "../parse";

/**
 * The keeper's limit for "Zone prüfen" (US-EQU-03): the share in percent by which the last measurement may deviate from
 * the ceiling of the zone. There is no default: without a value the app checks nothing and says so (P-08).
 */
export function LimitForm(props: {
  limit: number | null;
  busy: boolean;
  onSend: (percent: number | null) => void;
}) {
  const [text, setText] = useState(props.limit?.toString() ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const percent = wholeNumber(text);
    if (percent !== null && (Number.isNaN(percent) || percent < 1 || percent > 100))
      return setProblem("Die Grenze ist eine ganze Zahl von 1 bis 100.");
    setProblem(null);
    props.onSend(percent);
  };
  return (
    <FormRoot onSubmit={submit} aria-label="Abweichungsgrenze" className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {props.limit === null
          ? "Noch keine Grenze festgelegt: Die App prüft nichts. Lege fest, ab welcher Abweichung von der Zone du gewarnt werden willst."
          : `Du wirst gewarnt, wenn die letzte Messung um mehr als ${props.limit} % von der Obergrenze der Zone abweicht.`}
      </p>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        Abweichungsgrenze in Prozent (leer = keine Prüfung)
        <Input inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <Button type="submit" size="touch" variant="secondary" disabled={props.busy}>
        Grenze speichern
      </Button>
    </FormRoot>
  );
}
