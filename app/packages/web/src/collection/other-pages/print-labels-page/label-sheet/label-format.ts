// The print format of the QR pot labels: the one the keeper used last on this device (US-QS-32, SG-FORM-04). The route
// reads and writes it, not the print page: the page's own chunk must not import the storage helper (the initial JavaScript
// budget, QG-U6), so the page takes the format and a callback as props.
import { readStored, writeStored } from "@/shared/platform/browser/storage";
import type { LabelFormat, LabelFormatProps } from "./label-sheet";

/** The key of the last used print format on this device: a per-device convenience, the page works without it (DS-10). */
const FORMAT_KEY = "pflanzendex.print-labels-format";
const FORMATS = ["sheet", "single"] as const satisfies readonly LabelFormat[];

/** The format the keeper used last on this device; "A4-Bogen" the first time, or when the stored value is not a format. */
export function lastLabelFormat(): LabelFormat {
  const stored = readStored(FORMAT_KEY);
  return FORMATS.find((f) => f === stored) ?? "sheet";
}

/** Remembers a chosen format on this device; a storage that is unavailable changes nothing (DS-10). */
export function rememberLabelFormat(format: LabelFormat): void {
  writeStored(FORMAT_KEY, format);
}

/** The props the route gives the print page: the last format used here and the callback that remembers each choice. */
export function labelFormatProps(): LabelFormatProps {
  return { format: lastLabelFormat(), onFormat: rememberLabelFormat };
}
