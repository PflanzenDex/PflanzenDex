import { useCallback, useState } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { useReload, type ApiError, useRepeatKey } from "../../../shared/data";
import { setSpecimenNotes } from "../model/specimens-api";
import { SIGN_IN } from "./use-collection";
import table from "../../plants-screen/plant-layers/plant-layer/plant-notes/plant-notes.de.json";

const translate = texts(table);

/** The cached read of the notes of one plant (US-BES-18). */
export const notesKey = (specimenId: string) => ["specimen-notes", specimenId];

/**
 * State and action for the private notes of one plant (US-BES-18). A save reads the notes again and says what changed
 * (P-09); a refusal comes back to the form, which keeps the text (P-10).
 */
export function useNotes(access: PhotoAccess, plant: { id: string; name: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const keys = useRepeatKey();
  const reload = useReload(notesKey(plant.id));
  const { api, token } = access;
  const { id, name } = plant;

  const send = useCallback(
    async (notes: string): Promise<ApiError | null> => {
      setSaving(true);
      try {
        const credential = await token();
        if (!credential) return SIGN_IN;
        const key = keys.take();
        const r = await setSpecimenNotes(api, credential, { id, notes }, { key });
        keys.settle(key, r);
        if (!r.ok) return r.error;
        await reload();
        setMessage(
          translate(r.value.notes === null ? "message.cleared" : "message.saved", { name }),
        );
        return null;
      } finally {
        setSaving(false);
      }
    },
    [api, token, id, name, reload, keys],
  );

  return { message, saving, send, setMessage };
}
