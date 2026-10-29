import { useState } from "react";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { useWriteAction } from "../../../../kernel";
import { recordEquipment, type EquipmentInput } from "../../../equipment-api";
import type { EquipmentPrefill } from "../../../overviews/wishes-view/wishes-api";
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
  const [prefill, setPrefill] = useState<EquipmentPrefill | null>(null);
  const send = async (input: EquipmentInput): Promise<boolean> => {
    let saved = false;
    await write.run(async (t) => {
      const r = await recordEquipment(api, t, input);
      saved = r.ok;
      return r;
    }, `Equipment „${input.name}“ gespeichert.`);
    if (saved) {
      setPrefill(null);
      layer.closeLayer();
    }
    return saved;
  };
  const fill = (p: EquipmentPrefill) => {
    setPrefill(p);
    layer.openLayer();
  };
  return { write, send, prefill, fill, openLayer: layer.openLayer };
}
