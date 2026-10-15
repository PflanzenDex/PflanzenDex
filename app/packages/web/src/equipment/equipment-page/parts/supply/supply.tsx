import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { FormRoot } from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import type { EquipmentRow, SupplyLevel } from "../../../equipment-api";
import { SUPPLY_LABELS } from "../../../labels";

const LEVELS = ["available", "low", "empty"] as const satisfies readonly SupplyLevel[];
const LABEL = "flex min-w-0 flex-col gap-1 text-sm";

export interface SupplyActions {
  busy: boolean;
  onSupply: (item: EquipmentRow, supply: SupplyLevel) => void;
  onLink: (item: EquipmentRow, agentLink: string | null) => void;
}

function LinkForm(props: { item: EquipmentRow; actions: SupplyActions }) {
  const { item, actions } = props;
  const [text, setText] = useState(item.agentLink ?? "");
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    actions.onLink(item, text.trim() || null);
  };
  return (
    <FormRoot
      onSubmit={submit}
      aria-label={`Verknüpfung für ${item.name}`}
      className="mt-2 flex flex-col gap-2"
    >
      <label className={LABEL}>
        Text in der Behandlung (optional)
        <Input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="m-0 text-xs text-muted-foreground">
        Der freie Text deiner Behandlungen bleibt, wie er ist; die Verknüpfung findet nur den Vorrat
        dazu.
      </p>
      <Button type="submit" size="touch" variant="secondary" disabled={actions.busy}>
        Verknüpfung speichern
      </Button>
    </FormRoot>
  );
}

/**
 * The supply of a consumable (US-EQU-05): one tap sets it to available, low or empty. A consumable that is low or empty
 * is a need that "Was fehlt?" derives (US-EQU-07). A plant agent can be linked to the text of a treatment. A device has
 * no supply.
 */
export function Supply(props: { item: EquipmentRow; actions: SupplyActions }) {
  const { item, actions } = props;
  if (item.supply === null) return null;
  return (
    <div className="mt-2 flex flex-col gap-2 text-sm">
      <div role="group" aria-label={`Vorrat von ${item.name}`} className="flex flex-wrap gap-2">
        {LEVELS.map((level) => (
          <Button
            key={level}
            type="button"
            size="touch"
            variant={item.supply === level ? "default" : "secondary"}
            aria-pressed={item.supply === level}
            disabled={actions.busy}
            onClick={() => item.supply !== level && actions.onSupply(item, level)}
          >
            {SUPPLY_LABELS[level]}
          </Button>
        ))}
      </div>
      {item.type === "Plant agent" ? (
        <details>
          <summary className="cursor-pointer">
            Verknüpfung mit Behandlungen{item.agentLink ? `: ${item.agentLink}` : " (keine)"}
          </summary>
          <LinkForm key={`${item.id}:${item.agentLink}`} item={item} actions={actions} />
        </details>
      ) : null}
    </div>
  );
}
