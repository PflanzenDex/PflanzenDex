import { useCallback, useRef, useState } from "react";
import { SIGN_IN, type ApiError } from "../../../../shared/data";
import { recordMeasurement, type MeasurementInput } from "../../../shared/api/measurements-api";
import { measurementText } from "../../../shared/text";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Say } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { uploadPhoto } from "./photo-api";
import table from "./measurement-photo.de.json";

const t = texts(table);

/**
 * Saves a measurement and then its optional photo (US-WAC-01, US-WAC-05, US-WAC-06). The measurement is written first and
 * the fact line shows it at once. The confirmation "Gespeichert" comes only when the photo is stored as well: while it
 * uploads, `photoStatus` says so. A refused photo is an error toast that names the measurement as kept and the photo as
 * not, with the text of its code (P-10, DS-54); the form resets either way, because the measurement is stored.
 * This hook does not announce the confirmation: `confirmed` is the confirmed text of the current save (`null` while the
 * photo is stored, and after a refused photo), and the page announces it together with the growth note
 * (`useSaveAnnouncement`, US-QS-08, issue 2323). `saved` is the saved measurement's text, `null` before the first save
 * of this view; `saves` counts the saves of this view, so the growth note of a save closes again at the next save
 * (issue 1644).
 */
export function useMeasureSend(props: {
  api: string;
  token: () => Promise<string | undefined>;
  specimenId: string;
  invalidate: () => void;
  say: Say;
  /** Called after the measurement was written (US-QS-15: the page then knows its input is saved). */
  onSaved?: () => void;
}) {
  const { api, token, specimenId, invalidate, say, onSaved } = props;
  const [saved, setSaved] = useState<string | null>(null);
  const [saves, setSaves] = useState(0);
  // The confirmation keeps the number of its save, so a confirmation never counts for a later save (US-QS-08).
  const [confirmation, setConfirmation] = useState<{ save: number; text: string } | null>(null);
  const [photoPending, setPhotoPending] = useState(false);
  const count = useRef(0);
  const send = useCallback(
    async (input: MeasurementInput, photo?: File): Promise<ApiError | null> => {
      const tok = await token();
      if (!tok) return SIGN_IN;
      const r = await recordMeasurement({ api, token: tok }, specimenId, input);
      if (!r.ok) return r.error;
      const text = measurementText(r.value);
      count.current += 1;
      const save = count.current;
      setSaved(text);
      setSaves(save);
      onSaved?.();
      // The measurement is stored: the fact line shows it now, not only after a photo (US-WAC-06).
      invalidate();
      if (!photo) {
        setConfirmation({ save, text: t("saved", { measurement: text }) });
        return null;
      }
      setPhotoPending(true);
      const p = await uploadPhoto({ api, token: tok }, specimenId, {
        file: photo,
        date: r.value.date,
      });
      setPhotoPending(false);
      if (p.ok) setConfirmation({ save, text: t("saved", { measurement: text }) });
      else say(t("savedPhotoFailed", { reason: refusalText(p.error) }), "error");
      invalidate();
      return null;
    },
    [api, token, specimenId, invalidate, say, onSaved],
  );
  const confirmed = confirmation !== null && confirmation.save === saves ? confirmation.text : null;
  return { send, saved, saves, confirmed, photoStatus: photoPending ? t("photoSaving") : null };
}
