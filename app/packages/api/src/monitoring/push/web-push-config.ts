import type { PushSubscription } from "@pflanzendex/core";
import webpush from "web-push";
import type { PushSend } from "./web-push-channel";

export interface WebPushConfig {
  readonly publicKey: string;
  readonly privateKey: string;
  /** `mailto:` or `https:` contact of the operator, sent to the push services (RFC 8292). */
  readonly subject: string;
}

/** A reminder older than this is not shown any more by the push service (starting value, assumption): one day. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;
const PUSH_TIMEOUT_MS = 10_000;
const REQUIRED = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

/**
 * The VAPID key pair and contact from the environment (ADR 0015, an operator task in `09`). `null` when none is set
 * (local development: the stub stays); otherwise the names of what is missing or invalid, so the API can say it instead
 * of starting with half a configuration.
 */
export function webPushConfigFromEnv(
  env: NodeJS.ProcessEnv,
): WebPushConfig | readonly string[] | null {
  if (!REQUIRED.some((name) => env[name])) return null;
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) return missing;
  const config = {
    publicKey: env["VAPID_PUBLIC_KEY"] as string,
    privateKey: env["VAPID_PRIVATE_KEY"] as string,
    subject: env["VAPID_SUBJECT"] as string,
  };
  try {
    // The library checks the key lengths and the subject; a test audience is enough for that.
    webpush.getVapidHeaders(
      "https://push.invalid",
      config.subject,
      config.publicKey,
      config.privateKey,
      "aes128gcm",
    );
  } catch (error) {
    return [`VAPID_* invalid (${error instanceof Error ? error.message : String(error)})`];
  }
  return config;
}

/**
 * Encrypts the payload for the subscription (RFC 8291, aes128gcm) and signs the request with VAPID (RFC 8292) through
 * the Web Push library, then posts it to the endpoint with `fetch`; the answer is the status of the push service.
 */
export function webPushSender(config: WebPushConfig, fetchImpl: typeof fetch = fetch): PushSend {
  return async (subscription: PushSubscription, payload: string) => {
    const request = webpush.generateRequestDetails(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
      {
        vapidDetails: config,
        TTL: PUSH_TTL_SECONDS,
        urgency: "normal",
        contentEncoding: "aes128gcm",
      },
    );
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers))
      if (name.toLowerCase() !== "content-length") headers[name] = String(value);
    const response = await fetchImpl(request.endpoint, {
      method: request.method,
      headers,
      ...(request.body ? { body: new Uint8Array(request.body) } : {}),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return response.status;
  };
}
