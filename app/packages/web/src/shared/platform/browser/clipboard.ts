/** Copies text to the clipboard (DS-10: device APIs only here). Returns whether it worked; never throws. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * What the share sheet did (US-ACC-05): `shared` when the keeper picked a target, `cancelled` when the keeper closed the
 * sheet (AbortError, no result), `unsupported` when the device has no Web Share API, `failed` for any other refusal.
 */
export type ShareOutcome = "shared" | "cancelled" | "unsupported" | "failed";

/** Shares only the text through the device's share sheet (Web Share API, DS-10); the caller decides what a fallback is. Never throws. */
export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function")
    return "unsupported";
  try {
    await navigator.share({ text });
    return "shared";
  } catch (error) {
    return (error as { name?: unknown } | null)?.name === "AbortError" ? "cancelled" : "failed";
  }
}
