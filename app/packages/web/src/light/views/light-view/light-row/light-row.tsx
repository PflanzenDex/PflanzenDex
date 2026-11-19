import { ROW_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";

/** The group of a list of these rows: one flat group with a hairline between its rows (FX-06, SG-SHAPE-03). */
export const LIGHT_ROW_LIST = ROW_GROUP;

/**
 * One row of a zone or a location (US-QS-19, US-QS-32): the name and one line of facts. The whole row opens the layer of the
 * entry and shows a chevron (SG-TOUCH-02); there is no button inside it. It is a button, not a link, because the layer
 * needs the element that opened it, so the focus returns to the row when the layer closes (US-QS-15). Deleting is not on
 * the row; it lives in the layer (US-LIC-05, P-10).
 */
export function LightRow(props: { name: string; meta: string; layer: string }) {
  const { openLayer } = useLayer(props.layer);
  return (
    <GroupedRow
      bare
      haspopup="dialog"
      title={props.name}
      meta={props.meta}
      onClick={(event) => openLayer(event.currentTarget)}
    />
  );
}
