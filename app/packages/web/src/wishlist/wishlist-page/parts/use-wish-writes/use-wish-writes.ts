import { useState } from "react";
import { useWriteAction } from "../../../../kernel";
import { useCandidateWrite } from "../../../actions/actions";
import { useRepair } from "../../../hints/duplicate-wishes/duplicate-wishes";
import { createWish, type WishInput } from "../../../wishlist-api";

type Last = "write" | "repair";

/**
 * The writes of the wishlist screen (US-QS-22): recording a wish, buying, discarding and repairing duplicates. The outcome
 * shown is the one of the write that ran last (P-10): an older one never lingers.
 */
export function useWishWrites(
  api: string,
  token: () => Promise<string | undefined>,
  onWritten: () => void,
) {
  const write = useWriteAction(token, onWritten);
  const [last, setLast] = useState<Last>("write");
  const candidate = useCandidateWrite(api, token, onWritten, () => setLast("write"));
  const repair = useRepair(api, token, onWritten, () => setLast("repair"));
  const outcome =
    last === "repair"
      ? { done: repair.done && { hint: repair.done, toPlant: null }, error: repair.error }
      : candidate;
  const send = async (input: WishInput): Promise<boolean> => {
    let saved = false;
    await write.run(async (t) => {
      const r = await createWish(api, t, input);
      saved = r.ok;
      return r;
    }, `Wunsch „${input.name}“ gespeichert.`);
    if (saved) setLast("write");
    return saved;
  };
  return { write, candidate, repair, outcome, send };
}
