import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { FormRoot } from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { wholeNumber } from "../parse";

const LABEL = "flex min-w-0 flex-col gap-1 text-sm";

/** The manufacturer's statement about a lamp (DM-EQU-02): power in watt and light intensity in lux; empty = unknown. */
export function DataForm(props: {
  lampName: string;
  powerW: number | null;
  luxStatement: number | null;
  busy: boolean;
  onSend: (data: { powerW: number | null; luxStatement: number | null }) => void;
}) {
  const [power, setPower] = useState(props.powerW?.toString() ?? "");
  const [statement, setStatement] = useState(props.luxStatement?.toString() ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const powerW = wholeNumber(power);
    const luxStatement = wholeNumber(statement);
    if (Number.isNaN(powerW) || Number.isNaN(luxStatement))
      return setProblem("Bitte gib ganze Zahlen an oder lass das Feld leer.");
    setProblem(null);
    props.onSend({ powerW, luxStatement });
  };
  return (
    <FormRoot
      onSubmit={submit}
      aria-label={`Herstellerangabe für ${props.lampName}`}
      className="flex flex-col gap-2"
    >
      <div className="grid grid-cols-2 gap-2">
        <label className={LABEL}>
          Leistung in Watt (optional)
          <Input inputMode="numeric" value={power} onChange={(e) => setPower(e.target.value)} />
        </label>
        <label className={LABEL}>
          Lichtstärke laut Hersteller in Lux (optional)
          <Input
            inputMode="numeric"
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
          />
        </label>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <Button type="submit" size="touch" variant="secondary" disabled={props.busy}>
        Herstellerangabe speichern
      </Button>
    </FormRoot>
  );
}
