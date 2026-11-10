import { Link } from "react-router";
import { LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button, buttonVariants } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./view-layer.de.json";

const t = texts(table);

/** The id of the layer "Ansicht" (`?sheet=view`, US-QS-19). */
export const VIEW_LAYER = "view";

/**
 * The layer "Ansicht" of the Sammlung (US-QS-19, issue 1096): how the plants are grouped (`group=`, with the way to the
 * management of locations and light zones and to the print of the pot labels, US-BES-17) or how the species are arranged
 * (`sort=`). Takes data and callbacks only (DS-44); the area wires the address.
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
                variant={selected ? "secondary" : "outline"}
                aria-pressed={selected}
                className="justify-start"
                onClick={() => props.onGroup(o.value)}
              >
                {selected ? <span aria-hidden="true">✓</span> : null}
                {o.label}
              </Button>
            );
          })}
        </div>
        {props.onManage ? (
          <Button type="button" variant="outline" onClick={props.onManage}>
            {t("manage")}
          </Button>
        ) : null}
        {props.labelsTo ? (
          <Link to={props.labelsTo} className={buttonVariants({ variant: "outline" })}>
            {t("labels")}
          </Link>
        ) : null}
      </div>
    </LayerSheet>
  );
}
