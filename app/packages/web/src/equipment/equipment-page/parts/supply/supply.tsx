import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { FormRoot } from "@/shared/ui/form";
import { Input } from "@/shared/ui/input";
import type { EquipmentRow, SupplyLevel } from "../../../equipment-api";
import { SUPPLY_LABELS } from "../../../labels";
import { DisclosureSummary } from "@/shared/ui/more-help.disclosure-summary";
import { MoreHelp } from "@/shared/ui/more-help";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/shared/patterns/elements/segmented-control/segmented-control";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../equipment.de.json";

const t = texts(table);

const LEVELS = ["available", "low", "empty"] as const satisfies readonly SupplyLevel[];
const LEVEL_OPTIONS: readonly SegmentedOption<SupplyLevel>[] = LEVELS.map((level) => ({
  value: level,
  label: SUPPLY_LABELS[level],
}));
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
      {/* One line at 14 px (SG-COPY-05, SG-TYPE-03; the sentence was 12 px); the rest sits behind Mehr erfahren. */}
      <MoreHelp more={t("link.more")}>Dein Behandlungstext bleibt, wie er ist.</MoreHelp>
      <Button type="submit" size="touch" variant="secondary" disabled={actions.busy}>
        Verknüpfung sichern
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
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{t("supply.label")}</p>
        <SegmentedControl
          label={`Vorrat von ${item.name}`}
          options={LEVEL_OPTIONS}
          value={item.supply}
          disabled={actions.busy}
          onChange={(level) => {
            if (level !== item.supply) actions.onSupply(item, level);
          }}
        />
      </div>
      {item.type === "Plant agent" ? (
        <details>
          <DisclosureSummary>
            Verknüpfung mit Behandlungen{item.agentLink ? `: ${item.agentLink}` : " (keine)"}
          </DisclosureSummary>
          <LinkForm key={`${item.id}:${item.agentLink}`} item={item} actions={actions} />
        </details>
      ) : null}
    </div>
  );
}
