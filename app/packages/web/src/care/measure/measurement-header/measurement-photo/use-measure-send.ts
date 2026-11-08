import { useCallback, useState } from "react";
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
 * Saves a measurement and then its optional photo (US-WAC-01, US-WAC-05). The measurement is saved either way and says
 * so as a toast; a refused photo is a toast too, with the text of its code (P-10, DS-54), while the form resets.
 * `saved` is the saved measurement's text, `null` before the first save of this view; `saves` counts the saves of this
 * view, so the growth note of a save closes again at the next save (issue 1644).
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
  const send = useCallback(
    async (input: MeasurementInput, photo?: File): Promise<ApiError | null> => {
      const tok = await token();
      if (!tok) return SIGN_IN;
      const r = await recordMeasurement({ api, token: tok }, specimenId, input);
      if (!r.ok) return r.error;
      const text = measurementText(r.value);
      setSaved(text);
      setSaves((n) => n + 1);
      onSaved?.();
      say(t("saved", { measurement: text }));
      if (photo) {
        const p = await uploadPhoto({ api, token: tok }, specimenId, {
          file: photo,
          date: r.value.date,
        });
        if (!p.ok) say(refusalText(p.error), "error");
      }
      invalidate();
      return null;
    },
    [api, token, specimenId, invalidate, say, onSaved],
  );
  return { send, saved, saves };
}
