// The failure of the account load as a code and its German text (US-QS-32, F-0059). Kept apart from the session hook so each
// module stays within its size; the texts come from the message table of the sign-in views (SG-COPY-06, P-10).
import { isOnline } from "../../shared/platform/browser/network";
import { texts } from "../../shared/lib/text-rules/texts";
import { ACCOUNT_NOT_LOADABLE } from "../api/account-api";
import table from "../views/views.de.json";

const t = texts(table);

/** An answer that never came: the request failed (offline, unreachable) or ran into its timeout (US-QS-32). */
function noAnswer(e: unknown): boolean {
  const name = (e as { name?: unknown } | null)?.name;
  return (
    e instanceof TypeError ||
    (e instanceof Error && e.message === "account_unreachable") ||
    name === "TimeoutError" ||
    name === "AbortError"
  );
}

/**
 * The failure of the account load as its code and German text (US-QS-32, F-0059, SG-COPY-06, P-10). No answer shows the
 * connection state with the web's own code `network.not_reachable`; a refusal shows the text of its code when the message
 * table knows it, else `account.not_loadable`. A retry that fails again says so in front of the text.
 */
export async function failureOf(
  e: unknown,
  retrying: boolean,
): Promise<{ code: string; text: string }> {
  if (noAnswer(e)) {
    const offline = !isOnline();
    const text = offline
      ? retrying
        ? t("session.offlineAgain")
        : t("session.offline")
      : retrying
        ? t("session.unreachableAgain")
        : t("session.unreachable");
    return { code: "network.not_reachable", text };
  }
  const refusal = e instanceof Error ? e.message : "";
  // The message table of the core is read only when a refusal arrives: a static import would put it into the start chunk,
  // which the bundle budget keeps small (QG-U6, DS-08). When that chunk cannot load, the general text stands (P-10).
  const table: Record<string, string> = await import("@pflanzendex/core").then(
    (m) => m.ERROR_TEXTS,
    () => ({}),
  );
  const known = Object.hasOwn(table, refusal);
  const code = known ? refusal : ACCOUNT_NOT_LOADABLE;
  const text = known ? (table[refusal] ?? t("session.failed")) : t("session.failed");
  return { code, text: retrying ? `${t("session.failedAgain")} ${text}` : text };
}
