import { texts } from "@/shared/lib/text-rules/texts";
import { tabAccount } from "../../api";
import table from "./tab-account.de.json";

// The check is its own chunk: the entry carries only the slot the session sets (`tabAccount`) and the hook of `call`, so the
// sentence and the sign-in reader stay out of the initial JavaScript (DS-08, US-QS-07).
const t = texts(table);

/** The German text of `access.account_in_other_tab`: the same sentence as its entry in ERROR_TEXTS (a test keeps them equal). */
export const accountInOtherTabText = t("accountInOtherTab");

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
 * sent (`call`) and where it is buffered (`bufferWrite`): another account signed in on the device refuses it with
 * `access.account_in_other_tab`, no account at all (signed out in another tab) with `access.not_signed_in`. A tab whose session
 * loaded no account refuses nothing.
 */
export function accountRefusal(): { code: string; text: string } | undefined {
  const mine = tabAccount.sub;
  if (mine === undefined) return undefined;
  const sub = signedInSub();
  if (sub === mine) return undefined;
  return sub === undefined
    ? { code: "access.not_signed_in", text: "Bitte melde dich neu an." }
    : { code: "access.account_in_other_tab", text: accountInOtherTabText };
}
