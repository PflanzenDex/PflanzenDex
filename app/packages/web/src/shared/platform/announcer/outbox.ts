import { errorText } from "@/shared/lib/error-text";
import { call, type BufferedRequest, type Response } from "@/shared/data/api";
import { accountRefusal, signedInSub } from "@/shared/data/write-action/tab-account/tab-account";
import type { Api } from "./context";

/**
 * One write that waits (US-QS-10): the request as plain data (method, URL, body and the repeat-guard key of its action,
 * made when the write was queued; every delivery sends that same key, US-QS-03), how to get the token, what it says on
 * success, and what to do after delivery. No send function is stored.
 */
export type Write = {
  token: () => Promise<string | undefined>;
  request: BufferedRequest;
  success: string;
  after: () => void;
};
/**
 * The delivery's answer settles the promise of the tapping hook. `account` is the `sub` the write was made under
 * (US-QS-07).
 */
type Entry = Write & { done: (reply: Response<unknown>) => void; account: string | undefined };

const entries: Entry[] = [];
let announce: Api["announce"] | null = null;
let delivering = false;
let listening = false;

/** How long the result of a delivery stays on screen; a state that still waits stays until it is delivered. */
const RESULT_MS = 30_000;
let hide: ReturnType<typeof setTimeout> | undefined;
const say = (text: string, waiting: boolean) => {
  clearTimeout(hide);
  announce?.(text, text);
  if (!waiting) hide = setTimeout(() => announce?.("", null), RESULT_MS);
};

/**
 * Holds a write that was tapped without a network (US-QS-07, US-QS-10) and says so as announcement and visible note. It is
 * sent once when the network is back, with the same key; the promise settles on delivery with its answer, so the tapping
 * hook stays busy and a second tap cannot buffer it twice (US-QS-03). The buffer lives until the page is closed; it is not
 * stored on the device yet.
 */
export function bufferWrite(to: Api["announce"], write: Write): Promise<Response<unknown>> {
  announce = to;
  if (!listening) {
    listening = true;
    window.addEventListener("online", () => void deliverBuffered());
  }
  // A write of a tab that loaded another account is refused and not buffered (US-QS-07, P-04); the keeper is told (P-10).
  const refused = accountRefusal();
  if (refused) {
    say(`Nicht gesendet: ${errorText(refused.code)}`, false);
    return Promise.resolve({ ok: false, error: refused });
  }
  return new Promise<Response<unknown>>((done) => {
    // The account is read now, when the write is made, not when it is delivered (US-QS-07).
    entries.push({ ...write, done, account: signedInSub() });
    say(`Du bist offline. Wird gesendet, sobald du wieder online bist: ${write.success}`, true);
  });
}

/** Whether the account the device is signed in as now is the one the write was made under (US-QS-07). */
function sameAccount(entry: Entry): boolean {
  const sub = signedInSub();
  return sub !== undefined && sub === entry.account;
}

/** The answer of a write whose account is no longer the one signed in: it is refused, nothing is sent (US-QS-07, P-10). */
const changedAccount = (): Response<unknown> => ({
  ok: false,
  error: { code: "access.account_changed", text: errorText("access.account_changed") },
});

/**
 * Sends one buffered write under the account it was made under (US-QS-07, P-04). Another or no account: no token is read
 * and nothing is sent. The account is checked again after the token is read, so a sign-in in between cannot send it.
 */
async function sendEntry(entry: Entry): Promise<Response<unknown>> {
  if (!sameAccount(entry)) return changedAccount();
  const t = await entry.token();
  if (!sameAccount(entry)) return changedAccount();
  if (!t)
    return { ok: false, error: { code: "access.not_signed_in", text: "Bitte melde dich neu an." } };
  const { method, url, body, key } = entry.request;
  return call<unknown>(fetch, url, t, { method, body, key });
}

/**
 * Sends the buffered writes in the order they were tapped; stops, and keeps the rest, while the server is unreachable.
 * A write of another account is refused and dropped (US-QS-07); identical refusals are said once in the note.
 */
export async function deliverBuffered(): Promise<void> {
  if (delivering || entries.length === 0) return;
  delivering = true;
  const sent: string[] = [];
  const refused = new Set<string>();
  for (let entry = entries[0]; entry; entry = entries[0]) {
    const r = await sendEntry(entry);
    if (!r.ok && r.error.code === "network.not_reachable") break;
    entries.shift();
    if (r.ok) sent.push(entry.success);
    else refused.add(`Nicht gesendet: ${errorText(r.error.code)}`);
    entry.after();
    entry.done(r);
  }
  delivering = false;
  if (sent.length + refused.size === 0) return;
  const head = sent.length > 1 ? `${sent.length} Änderungen nachträglich gesendet.` : "";
  const one = sent.length === 1 ? `Nachträglich gesendet: ${sent[0]}` : "";
  say([one, head, ...refused].filter(Boolean).join(" "), false);
}
