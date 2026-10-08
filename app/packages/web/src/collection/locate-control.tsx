import { useId, useState } from "react";
import type { LightLocation } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Label } from "@/components/ui/display/label/label";
import { Select } from "@/components/ui/fields/select/select";
import { Actions, Quiet } from "./parts";

/**
 * Sets the location of a specimen (US-PHA-03, the action behind the hint "Standort fehlt"). The location is chosen from
 * the account's own locations, never typed (FR-PHA-03). Without any location the control says what to do first (P-09).
 */
export function LocateControl(props: {
  specimenName: string;
  locations: readonly LightLocation[];
  busy: boolean;
  onLocate: (locationId: string, success: string) => void;
  onCreateLocation: () => void;
}) {
  const { specimenName: name, locations } = props;
  const [choice, setChoice] = useState("");
  const id = useId();
  if (locations.length === 0)
    return (
      <>
        <Quiet>
          Du hast noch keinen Standort angelegt. Lege zuerst in der Sammlung unter „Standorte
          verwalten“ einen Standort an.
        </Quiet>
        <Actions>
          <Button type="button" variant="outline" onClick={props.onCreateLocation}>
            Standorte verwalten
          </Button>
        </Actions>
      </>
    );
  const chosen = locations.find((s) => s.id === choice);
  return (
    <>
      <div className="mt-2 grid gap-2">
        <Label htmlFor={id}>{`Standort für „${name}“`}</Label>
        <Select id={id} value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Standort wählen …</option>
          {locations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <Actions>
        <Button
          type="button"
          disabled={!chosen || props.busy}
          aria-label={`Standort setzen: ${name}`}
          onClick={() =>
            chosen &&
            props.onLocate(chosen.id, `„${name}“ steht jetzt am Standort „${chosen.name}“.`)
          }
        >
          Standort setzen
        </Button>
      </Actions>
    </>
  );
}
