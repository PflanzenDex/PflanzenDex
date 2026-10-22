import type {
  ChannelStore,
  PushSubscription,
  ReminderChannel,
  ReminderMessage,
} from "@pflanzendex/core";

/** Sends one encrypted payload to one subscription and answers the HTTP status of the push service. */
export type PushSend = (subscription: PushSubscription, payload: string) => Promise<number>;

/**
 * Largest payload in UTF-8 bytes (starting value, assumption): RFC 8291 allows a record of 4096 bytes, aes128gcm takes
 * 86 bytes of header, 16 of tag and 1 of padding off that, so 3993 bytes of plaintext would fit; the margin covers push
 * services that are stricter. The inbox keeps the full list, the push only carries what fits.
 */
export const PUSH_PAYLOAD_LIMIT = 3000;

/** The push service no longer knows the subscription (RFC 8030, section 7.3): it is removed, never retried. */
const GONE = new Set([404, 410]);

/**
 * The JSON the service worker shows: title, body and as many occasions as fit, `more` counts the rest. The order of the
 * bundle is kept, so the first occasions of the inbox are the ones in the push.
 */
export function pushPayload(message: ReminderMessage, limit = PUSH_PAYLOAD_LIMIT): string {
  const items = message.items.map(({ id, occasion, text, nextAction }) => ({
    id,
    occasion,
    text,
    nextAction,
  }));
  for (let n = items.length; n >= 0; n -= 1) {
    const json = JSON.stringify({
      title: message.title,
      body: message.body,
      url: "/",
      items: items.slice(0, n),
      more: items.length - n,
    });
    if (Buffer.byteLength(json, "utf8") <= limit) return json;
  }
  throw new Error("web push: the message does not fit into a push even without occasions");
}

/**
 * The real delivery channel (US-MON-01, E-10, ADR 0015): standard Web Push with VAPID straight to the endpoint of every
 * subscription of the account, no push vendor. A subscription the push service answers with 404 or 410 is dead and
 * removed. At least one accepted push counts as delivered; otherwise the send throws, so the job retries and the third
 * failure leaves the reminder `failed` and visible (FR-MON-08, P-10). Failures next to a delivery are logged.
 */
export class WebPushReminderChannel implements ReminderChannel {
  constructor(
    private readonly deps: {
      readonly send: PushSend;
      readonly channels: Pick<ChannelStore, "remove">;
      readonly log?: (line: string) => void;
    },
  ) {}

  async send(
    userId: string,
    message: ReminderMessage,
    subscriptions: readonly PushSubscription[],
  ): Promise<void> {
    const log = this.deps.log ?? console.warn;
    const payload = pushPayload(message);
    let delivered = 0;
    let gone = 0;
    const failures: string[] = [];
    for (const subscription of subscriptions) {
      const host = hostOf(subscription.endpoint);
      try {
        const status = await this.deps.send(subscription, payload);
        if (status >= 200 && status < 300) delivered += 1;
        else if (GONE.has(status)) {
          await this.deps.channels.remove(userId, subscription.endpoint);
          gone += 1;
          log(`web push: account ${userId}, ${host} answered ${status}, subscription removed`);
        } else failures.push(`${host} answered ${status}`);
      } catch (error) {
        failures.push(`${host}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (delivered > 0) {
      if (failures.length > 0)
        log(`web push: account ${userId}, delivered ${delivered}, failed ${failures.join("; ")}`);
      return;
    }
    if (failures.length > 0) throw new Error(`web push failed: ${failures.join("; ")}`);
    throw new Error(`web push: all ${gone} subscription(s) were gone and are removed`);
  }
}

/** Only the host goes into logs and errors: the path of an endpoint is a capability for that browser. */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid endpoint";
  }
}
