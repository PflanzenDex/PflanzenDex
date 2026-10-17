import { useWriteAction } from "../../../kernel";
import type { WishActions } from "./wishes-view";
import {
  buyEquipmentWish,
  createEquipmentWish,
  discardEquipmentWish,
  type EquipmentPrefill,
} from "./wishes-api";

type Token = () => Promise<string | undefined>;

/**
 * The writes on equipment wishes (US-EQU-08). "Gekauft" hands the prefill to the equipment form through `onPrefill`.
 * The outcome (message or refusal) is shown by the caller.
 */
export function useWishActions(
  api: string,
  token: Token,
  onWritten: () => void,
  onPrefill: (prefill: EquipmentPrefill) => void,
) {
  const write = useWriteAction(token, onWritten);
  const actions: WishActions = {
    busy: write.running,
    onCreate: async (input) => {
      let saved = false;
      await write.run(async (t) => {
        const r = await createEquipmentWish(api, t, input);
        saved = r.ok;
        return r;
      }, `Equipment-Wunsch „${input.name}“ gespeichert.`);
      return saved;
    },
    onBuy: (wish) =>
      void write.run(async (t) => {
        const r = await buyEquipmentWish(api, t, wish.id);
        if (r.ok) onPrefill(r.value.prefill);
        return r;
      }, `„${wish.name}“ ist als gekauft vermerkt. Erfasse es jetzt als Equipment.`),
    onDiscard: (wish) =>
      void write.run(
        (t) => discardEquipmentWish(api, t, wish.id),
        `Wunsch „${wish.name}“ verworfen.`,
      ),
  };
  return { actions, message: write.message, error: write.error };
}
