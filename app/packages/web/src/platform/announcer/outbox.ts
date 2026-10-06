import { errorText } from "@/lib/error-text";
import type { Api } from "./context";

type Reply = { ok: true } | { ok: false; error: { code: string } };
/** One write that waits: how to get the token and send it, what it says on success, and what to do after delivery. */
export type Write = {
  token: () => Promise<string | undefined>;
  send: (token: string) => Promise<Reply>;
  success: string;
  after: () => void;
};
type Entry = Write & { done: () => void };

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
 * Holds a write that was tapped without a network (US-QS-07, US-QS-10) and says so as announcement and visible note. It is sent
 * once when the network is back; the promise settles then, so the tapping hook stays busy and a second tap cannot
 * buffer it twice (US-QS-03). The buffer lives until the page is closed; it is not stored on the device yet.
 */
export function bufferWrite(to: Api["announce"], write: Write): Promise<void> {
  announce = to;
  if (!listening) {
    listening = true;
    window.addEventListener("online", () => void deliverBuffered());
  }
  return new Promise<void>((done) => {
    entries.push({ ...write, done });
    say(`Du bist offline. Wird gesendet, sobald du wieder online bist: ${write.success}`, true);
  });
}

/** Sends the buffered writes in the order they were tapped; stops, and keeps the rest, while the server is unreachable. */
export async function deliverBuffered(): Promise<void> {
  if (delivering || entries.length === 0) return;
  delivering = true;
  const sent: string[] = [];
  const refused: string[] = [];
  for (let entry = entries[0]; entry; entry = entries[0]) {
    const t = await entry.token();
    const r: Reply = t
      ? await entry.send(t)
      : { ok: false, error: { code: "access.not_signed_in" } };
    if (!r.ok && r.error.code === "network.not_reachable") break;
    entries.shift();
    if (r.ok) sent.push(entry.success);
    else refused.push(`Nicht gesendet: ${errorText(r.error.code)}`);
    entry.after();
    entry.done();
  }
  delivering = false;
  if (sent.length + refused.length === 0) return;
  const head = sent.length > 1 ? `${sent.length} Änderungen nachträglich gesendet.` : "";
  const one = sent.length === 1 ? `Nachträglich gesendet: ${sent[0]}` : "";
  say([one, head, ...refused].filter(Boolean).join(" "), false);
}
