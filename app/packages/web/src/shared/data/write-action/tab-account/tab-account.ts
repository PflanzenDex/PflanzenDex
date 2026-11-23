import { errorText } from "@/shared/lib/error-text";
import { tabAccount } from "../../api";

// The check is its own chunk: the entry carries only the slot the session sets (`tabAccount`) and the hook of `call`, so the
// sign-in reader stays out of the initial JavaScript (DS-08, US-QS-07). Its texts are the ERROR_TEXTS of its codes: one code,
// one message.

/** The key prefix under which the sign-in library keeps a signed-in user in `localStorage` (account/api/sign-in-client.ts). */
const USER_KEY_PREFIX = "oidc.user:";

/**
 * The account (`sub`) the device is signed in as, read from the storage of the sign-in library (US-QS-07, P-04). Every kept
 * user must name the same account: two different accounts, an unreadable user or unreadable storage count as none, so a
 * write is never sent under a guess.
 */
export function signedInSub(): string | undefined {
  try {
    const subs = new Set(
      Object.keys(localStorage)
        .filter((key) => key.startsWith(USER_KEY_PREFIX))
        .map(
          (key) =>
            (
              JSON.parse(localStorage.getItem(key) ?? "null") as {
                profile?: { sub?: unknown };
              } | null
            )?.profile?.sub,
        ),
    );
    const [sub] = subs;
    return subs.size === 1 && typeof sub === "string" ? sub : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The refusal of a write of this tab, or `undefined` when the write may go on (US-QS-07, P-04). A write is checked where it is
 * sent (`call`) and where it is buffered (`bufferWrite`). Another account signed in on the device refuses it with
 * `access.account_in_other_tab`; no account at all (signed out in another tab) and a session that loaded no account
 * (`null`, fail closed) with `access.not_signed_in`. A tab whose session has not loaded anything refuses nothing.
 */
export function accountRefusal(): { code: string; text: string } | undefined {
  const mine = tabAccount.sub;
  if (mine === undefined) return undefined;
  const sub = signedInSub();
  if (mine !== null && sub === mine) return undefined;
  const code =
    mine !== null && sub !== undefined ? "access.account_in_other_tab" : "access.not_signed_in";
  return { code, text: errorText(code) };
}
