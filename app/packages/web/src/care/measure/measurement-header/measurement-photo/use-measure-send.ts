import { useCallback, useRef, useState } from "react";
import { SIGN_IN, isUnanswered, newRepeatKey, type ApiError } from "../../../../shared/data";
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
 * `saved` is the saved measurement's text, `null` before the first save of this view; `saves` counts the saves of this
 * view, so the growth note of a save closes again at the next save (issue 1644).
 *
 * The repeat-guard key (US-QS-03) of the measurement is made when the keeper saves: after a lost answer the next save
 * repeats the write with that key, and a stored answer or a refusal drops it. The photo is sent after the measurement
 * with a key of its own: the form resets after the measurement, so a lost photo answer is never repeated by this form.
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
  const [photoPending, setPhotoPending] = useState(false);
  /** The key of the measurement whose answer was lost: the next save repeats that write (US-QS-03). */
  const held = useRef<string | null>(null);
  const send = useCallback(
    async (input: MeasurementInput, photo?: File): Promise<ApiError | null> => {
      const tok = await token();
      if (!tok) return SIGN_IN;
      const key = held.current ?? newRepeatKey();
      const r = await recordMeasurement({ api, token: tok }, specimenId, input, { key });
      held.current = !r.ok && isUnanswered(r.error) ? key : null;
      if (!r.ok) return r.error;
      const text = measurementText(r.value);
      setSaved(text);
      setSaves((n) => n + 1);
      onSaved?.();
      // The measurement is stored: the fact line shows it now, not only after a photo (US-WAC-06).
      invalidate();
      if (!photo) {
        say(t("saved", { measurement: text }));
        return null;
      }
      setPhotoPending(true);
      const p = await uploadPhoto({ api, token: tok }, specimenId, {
        file: photo,
        date: r.value.date,
      });
      setPhotoPending(false);
      if (p.ok) say(t("saved", { measurement: text }));
      else say(t("savedPhotoFailed", { reason: refusalText(p.error) }), "error");
      invalidate();
      return null;
    },
    [api, token, specimenId, invalidate, say, onSaved],
  );
  return { send, saved, saves, photoStatus: photoPending ? t("photoSaving") : null };
}
