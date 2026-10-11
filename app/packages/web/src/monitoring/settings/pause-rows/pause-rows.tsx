import { REMINDER_OCCASIONS, type ReminderOccasion } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { Label } from "@/components/ui/display/label/label";
import { currentTimeZone } from "../../../kernel";
import { addDays, localToday } from "./pause";

export type Paused = Readonly<Partial<Record<ReminderOccasion, string>>>;

export const OCCASION_TEXT: Record<ReminderOccasion, string> = {
  phase: "Pflegephasen",
  treatment: "Behandlungen",
  measurement: "Messungen",
  watering: "Gießen",
  swap: "Tausch",
  friends: "Freunde",
};

/** `paused` with the pause of `o` set to `until`, or removed when `until` is empty. */
export const withPause = (paused: Paused, o: ReminderOccasion, until: string): Paused => {
  if (until !== "") return { ...paused, [o]: until };
  return Object.fromEntries(Object.entries(paused).filter(([k]) => k !== o));
};

/** One row of "Pause je Anlass": a date, "Eine Woche" and, while paused, "Pause beenden". */
export function PauseRow(props: {
  occasion: ReminderOccasion;
  until: string;
  onChange: (o: ReminderOccasion, until: string) => void;
}) {
  const { occasion: o, until } = props;
  const id = `pause-${o}`;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{OCCASION_TEXT[o]} pausiert bis</Label>
        <Input
          id={id}
          type="date"
          value={until}
          onChange={(e) => props.onChange(o, e.target.value)}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${OCCASION_TEXT[o]}: eine Woche pausieren`}
        onClick={() => props.onChange(o, addDays(localToday(currentTimeZone()), 7))}
      >
        Eine Woche
      </Button>
      {until !== "" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`${OCCASION_TEXT[o]}: Pause beenden`}
          onClick={() => props.onChange(o, "")}
        >
          Pause beenden
        </Button>
      )}
    </div>
  );
}

/** All occasions as rows of one group. */
export function PauseRows(props: {
  paused: Paused;
  onChange: (o: ReminderOccasion, until: string) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="mb-1 text-sm font-medium">Pause je Anlass</legend>
      <p className="m-0 text-sm text-muted-foreground">
        Eine Pause gilt bis zum gewählten Tag einschließlich. Die Heute-Liste zeigt weiterhin alles,
        was fällig ist; Daten gehen nicht verloren. Einen Anlass ganz auszuschalten geht unter
        Einstellungen.
      </p>
      {REMINDER_OCCASIONS.map((o) => (
        <PauseRow key={o} occasion={o} until={props.paused[o] ?? ""} onChange={props.onChange} />
      ))}
    </fieldset>
  );
}
