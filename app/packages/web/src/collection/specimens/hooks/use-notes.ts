import { useCallback, useState } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import type { ApiError } from "../../../shared/data";
import { setSpecimenNotes } from "../model/specimens-api";
import { SIGN_IN, type Token } from "./use-collection";
import table from "../../plants-screen/plant-layers/plant-layer/plant-notes/plant-notes.de.json";

const translate = texts(table);

/** The plant whose notes are being written; `notes` are the notes the layer showed (US-BES-18). */
export type NotesTarget = { id: string; name: string; notes: string | null };

/**
 * State and action for the private notes (US-BES-18). After a save the page says what changed and reloads the list
 * (P-09); a refusal stays in the form (P-10).
 */
export function useNotes(api: string, token: Token, after: () => void) {
  const [open, setOpen] = useState<NotesTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const send = useCallback(
    async (notes: string): Promise<ApiError | null> => {
      const credential = await token();
      if (!credential || !open) return SIGN_IN;
      const r = await setSpecimenNotes(api, credential, { id: open.id, notes });
      if (!r.ok) return r.error;
      setMessage(
        translate(r.value.notes === null ? "message.cleared" : "message.saved", {
          name: open.name,
        }),
      );
      setOpen(null);
      after();
      return null;
    },
    [api, token, open, after],
  );

  return { open, message, send, setOpen, setMessage };
}
