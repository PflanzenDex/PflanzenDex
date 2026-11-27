import { Input } from "@/shared/ui/input";
import { FieldLegend, FieldSet } from "@/shared/ui/field.set";
import { Label } from "@/shared/ui/label";

type TimeFieldsProps = {
  sendTime: string;
  quiet: readonly [string, string];
  days: string;
  on: {
    sendTime: (v: string) => void;
    quiet: (from: string, to: string) => void;
    days: (v: string) => void;
  };
};

/** Time of the daily check, quiet hours and the days of an overdue measurement. */
export function TimeFields({ sendTime, quiet, days, on }: TimeFieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="reminder-time">Uhrzeit der täglichen Prüfung</Label>
        <Input
          id="reminder-time"
          type="time"
          value={sendTime}
          required
          onChange={(e) => on.sendTime(e.target.value)}
          aria-describedby="reminder-time-hint"
        />
        <p id="reminder-time-hint" className="m-0 text-sm text-muted-foreground">
          In deiner Zeitzone. Es kommt höchstens eine Erinnerung am Tag, und nur, wenn etwas zu tun
          ist.
        </p>
      </div>
      <FieldSet className="gap-2">
        <FieldLegend variant="label" className="mb-1">
          Ruhezeit
        </FieldLegend>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiet-from">Von</Label>
            <Input
              id="quiet-from"
              type="time"
              value={quiet[0]}
              onChange={(e) => on.quiet(e.target.value, quiet[1])}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiet-to">Bis</Label>
            <Input
              id="quiet-to"
              type="time"
              value={quiet[1]}
              onChange={(e) => on.quiet(quiet[0], e.target.value)}
            />
          </div>
        </div>
        <p className="m-0 text-sm text-muted-foreground">
          In dieser Zeit kommt nichts an; die Erinnerung wartet bis zum Ende. Beide Zeiten leer:
          keine Pause.
        </p>
      </FieldSet>
      <div className="flex flex-col gap-1">
        <Label htmlFor="measurement-days">Messung überfällig nach (Tagen)</Label>
        <Input
          id="measurement-days"
          inputMode="numeric"
          autoComplete="off"
          value={days}
          onChange={(e) => on.days(e.target.value)}
        />
      </div>
    </>
  );
}
