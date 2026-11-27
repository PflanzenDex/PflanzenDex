import { Check } from "lucide-react";
import { GroupedList, GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button } from "@/shared/ui/button";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./view-layer.de.json";

const t = texts(table);

/** The id of the layer "Ansicht" (`?sheet=view`, US-QS-19). */
export const VIEW_LAYER = "view";

/**
 * The layer "Ansicht" of the Sammlung (US-QS-19, issue 1096): how the plants are grouped (`group=`, with the way to the
 * management of locations and light zones and to the print of the pot labels, US-BES-17) or how the species are arranged
 * (`sort=`). The choices are neutral until chosen, the chosen one is tinted with its check mark (SG-COLOR-03); the ways on
 * to the management and to the print are neutral rows with the chevron of every opener (SG-COLOR-02, SG-TOUCH-02). Takes
 * data and callbacks only (DS-44); the area wires the address.
 */
export function ViewLayer<G extends string>(props: {
  group: G;
  options: readonly { value: G; label: string }[];
  onGroup: (g: G) => void;
  /** The name of the group of choices, e.g. "Gruppierung der Pflanzen". */
  label: string;
  onManage?: () => void;
  /** The address of the print of the pot labels; without it the layer offers no print (US-BES-17, P-12). */
  labelsTo?: string | undefined;
}) {
  return (
    <LayerSheet id={VIEW_LAYER} title={t("title")}>
      <div className="flex flex-col gap-4">
        <div role="group" aria-label={props.label} className="flex flex-col gap-2">
          {props.options.map((o) => {
            const selected = o.value === props.group;
            return (
              <Button
                key={o.value}
                type="button"
                variant={selected ? "secondary" : "ghost"}
                aria-pressed={selected}
                className="justify-start"
                onClick={() => props.onGroup(o.value)}
              >
                {selected ? <Check aria-hidden="true" className="size-5 shrink-0" /> : null}
                {o.label}
              </Button>
            );
          })}
        </div>
        {props.onManage || props.labelsTo ? (
          <GroupedList>
            {props.onManage ? <GroupedRow onClick={props.onManage} title={t("manage")} /> : null}
            {props.labelsTo ? <GroupedRow to={props.labelsTo} title={t("labels")} /> : null}
          </GroupedList>
        ) : null}
      </div>
    </LayerSheet>
  );
}
