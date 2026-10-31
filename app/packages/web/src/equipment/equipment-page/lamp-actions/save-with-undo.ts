import type { ToastApi } from "@/components/shared/states/toast/toast-provider/toast-provider";
import type { Response, useWriteAction } from "../../../kernel";

type Write = ReturnType<typeof useWriteAction>;
type Send = (token: string) => Promise<Response<unknown>>;

/**
 * Saves a change and, once the server has saved it, offers "Rückgängig" in a toast that writes `before` back (US-QS-07,
 * US-EQU-02, US-EQU-05, P-10). A refused or buffered change offers nothing: the outcome of the layer says what happened.
 */
export async function saveWithUndo<T>(
  write: Write,
  toast: ToastApi,
  change: {
    before: T;
    after: T;
    /** The write of one value; the change and its undo use the same one. */
    send: (value: T) => Send;
    /** The German text of the toast for a saved value. */
    said: (value: T) => string;
    /** The German outcome in the layer for the change and for the undo. */
    saved: string;
    undone: string;
  },
): Promise<void> {
  let saved = false;
  await write.run(async (t) => {
    const r = await change.send(change.after)(t);
    saved = r.ok;
    return r;
  }, change.saved);
  if (!saved) return;
  toast.show({
    message: change.said(change.after),
    action: {
      label: "Rückgängig",
      onAction: () => void write.run(change.send(change.before), change.undone),
    },
  });
}
