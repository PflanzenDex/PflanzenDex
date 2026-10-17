import { textField, type ErrorDetail } from "../kernel";
import { WISH_LIMITS } from "./types";

const SCHEME = "https://";

/**
 * `https://host.tld/...` without blanks and without credentials (`user:password@`): no `http`, no `javascript:`. The
 * address is only ever shown as a link, never loaded (P-05), but it must not carry secrets into the database either.
 * Linear scans, no regular expression on user text.
 */
function isHttps(text: string): boolean {
  if (!text.toLowerCase().startsWith(SCHEME) || [...text].some((ch) => ch.trim() === ""))
    return false;
  const authority = text.slice(SCHEME.length).split(/[/?#]/, 1)[0] ?? "";
  if (authority.includes("@")) return false;
  const host = authority.split(":", 1)[0] ?? "";
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
