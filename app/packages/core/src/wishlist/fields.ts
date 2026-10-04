import { textField, type ErrorDetail } from "../kernel";
import { WISH_LIMITS } from "./types";

const SCHEME = "https://";

/** `https://host.tld/...` without blanks: no `http`, no `javascript:`, because the picture is shown to the keeper. */
function isHttps(text: string): boolean {
  if (!text.toLowerCase().startsWith(SCHEME) || /\s/.test(text)) return false;
  const host = text.slice(SCHEME.length).split(/[/?#]/, 1)[0] ?? "";
  return host.includes(".") && !host.startsWith(".") && !host.endsWith(".");
}

export function httpsUrlField(field: string) {
  const text = textField(field, WISH_LIMITS.imageUrl);
  return (value: unknown): string | ErrorDetail => {
    const checked = text(value);
    if (typeof checked !== "string") return checked;
    return isHttps(checked) ? checked : { field, code: "input.invalid" };
  };
}
