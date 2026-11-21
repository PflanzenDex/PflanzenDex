import { useState } from "react";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { accountKey, useWriteAction } from "../../../../shared/data";
import { recordEquipment, type EquipmentInput } from "../../../equipment-api";
import type { EquipmentFill } from "../../../equipment-form/equipment-form";
import { NEW_LAYER } from "../tiles/equipment-tiles/equipment-tiles";

/**
 * Recording equipment from the layer "Neues Equipment" (US-QS-22): the saved record is announced on the screen behind and
 * closes the layer; a refusal keeps it open at its field (P-10). `prefill` comes from "Gekauft" on a wish (US-EQU-08).
 */
export function useRecord(
  api: string,
  token: () => Promise<string | undefined>,
  onWritten: () => void,
) {
  const write = useWriteAction(token, onWritten);
  const layer = useLayer(NEW_LAYER);
  const [prefill, setPrefill] = useState<EquipmentFill | null>(null);
  const send = async (input: EquipmentInput): Promise<boolean> => {
    let saved = false;
    await write.run(
      async (t, opts) => {
        const r = await recordEquipment(api, t, input, opts);
        saved = r.ok;
        return r;
      },
      `Gerät „${input.name}“ gespeichert.`,
      // A create (a record is added): the operation only, the form is the body (US-QS-03).
      accountKey("equipment:record"),
    );
    if (saved) {
      setPrefill(null);
      layer.closeLayer();
    }
    return saved;
  };
  // `from` is the control that opens the form: Abbrechen and the saved form return the focus to it (WCAG 2.4.3).
  const fill = (p: EquipmentFill, from?: HTMLElement | null) => {
    setPrefill(p);
    layer.openLayer(from);
  };
  return { write, send, prefill, fill, openLayer: layer.openLayer };
}
