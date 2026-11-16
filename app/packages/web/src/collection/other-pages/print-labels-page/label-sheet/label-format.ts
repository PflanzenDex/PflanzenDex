// The print format of the QR pot labels: the one the keeper used last on this device (US-QS-32, SG-FORM-04).
import { useState } from "react";
import { readStored, writeStored } from "@/shared/platform/browser/storage";
import type { LabelFormat } from "./label-sheet";

/** The key of the last used print format on this device: a per-device convenience, the page works without it (DS-10). */
const FORMAT_KEY = "pflanzendex.print-labels-format";
const FORMATS = ["sheet", "single"] as const satisfies readonly LabelFormat[];

/** The format the keeper used last on this device; "A4-Bogen" the first time, or when the stored value is not a format. */
function lastFormat(): LabelFormat {
  const stored = readStored(FORMAT_KEY);
  return FORMATS.find((f) => f === stored) ?? "sheet";
}

/** The chosen format and its setter; a choice is remembered on this device at once. */
export function useLabelFormat(): [LabelFormat, (format: LabelFormat) => void] {
  const [format, setFormat] = useState<LabelFormat>(lastFormat);
  const choose = (next: LabelFormat) => {
    setFormat(next);
    writeStored(FORMAT_KEY, next);
  };
  return [format, choose];
}
