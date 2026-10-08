import { useCallback, useState } from "react";
import { SIGN_IN, type ApiError } from "../../../../kernel";
import { recordMeasurement, type MeasurementInput } from "../../../shared/api/measurements-api";
import { measurementText } from "../../../shared/text";
import { uploadPhoto } from "./photo-api";

/**
 * Saves a measurement and then its optional photo (US-WAC-01, US-WAC-05). The measurement is saved either way; a
 * refused photo stays visible with the text of its code (P-10) while the form resets.
 */
export function useMeasureSend(props: {
  api: string;
  token: () => Promise<string | undefined>;
  specimenId: string;
  invalidate: () => void;
}) {
  const { api, token, specimenId, invalidate } = props;
  const [saved, setSaved] = useState<string | null>(null);
  const [photoRefusal, setPhotoRefusal] = useState<ApiError | null>(null);
  const send = useCallback(
    async (input: MeasurementInput, photo?: File): Promise<ApiError | null> => {
      const t = await token();
      if (!t) return SIGN_IN;
      const r = await recordMeasurement({ api, token: t }, specimenId, input);
      if (!r.ok) return r.error;
      setSaved(measurementText(r.value));
      setPhotoRefusal(null);
      if (photo) {
        const p = await uploadPhoto({ api, token: t }, specimenId, {
          file: photo,
          date: r.value.date,
        });
        if (!p.ok) setPhotoRefusal(p.error);
      }
      invalidate();
      return null;
    },
    [api, token, specimenId, invalidate],
  );
  return { send, saved, photoRefusal };
}
