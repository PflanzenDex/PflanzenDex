import { createDecipheriv, createECDH, createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Occasion, PushSubscription, ReminderMessage } from "@pflanzendex/core";
import { ChannelsPostgres, migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { reminderChannelFromEnv, StubReminderChannel } from "../runtime";
import { PUSH_PAYLOAD_LIMIT, pushPayload, WebPushReminderChannel } from "./web-push-channel";
import { PUSH_TTL_SECONDS, webPushConfigFromEnv, webPushSender } from "./web-push-config";

// US-MON-01 (#941, ADR 0015): the real delivery channel. Standard Web Push with VAPID to the endpoint of every
// subscription, dead subscriptions removed, failures thrown so the job retries (FR-MON-08), configuration from the env.
const occasion = (n: number): Occasion => ({
  id: `measurement:${n}`,
  occasion: "measurement",
  text: `„Exemplar ${n}“ wurde seit mehr als 30 Tagen nicht gemessen.`,
  nextAction: "Miss das Exemplar und trage die Messung ein.",
});
const message = (n: number): ReminderMessage => ({
  title: "PflanzenDex",
  body: `${n} Sachen brauchen heute dich.`,
  items: Array.from({ length: n }, (_, i) => occasion(i + 1)),
});
const subscription = (host: string): PushSubscription => ({
  endpoint: `https://${host}/push/${randomUUID()}`,
  p256dh: "key",
  auth: "auth",
});

/** A channel whose push service answers per host; records removals and log lines. */
function channelWith(answers: Record<string, number | Error>) {
  const removed: string[] = [];
  const lines: string[] = [];
  const channel = new WebPushReminderChannel({
    send: async (s) => {
      const answer = answers[new URL(s.endpoint).host] ?? 201;
      if (answer instanceof Error) throw answer;
      return answer;
    },
    channels: { remove: async (_userId, endpoint) => (removed.push(endpoint), true) },
    log: (l) => lines.push(l),
  });
  return { channel, removed, lines };
}

describe("US-MON-01 the push payload stays under the Web Push size limit", () => {
  it("US-MON-01 carries every occasion when they fit, in the order of the bundle", () => {
    const json = JSON.parse(pushPayload(message(3)));
    expect(json).toMatchObject({
      title: "PflanzenDex",
      body: "3 Sachen brauchen heute dich.",
      more: 0,
    });
    expect(json.items.map((i: Occasion) => i.id)).toEqual([
      "measurement:1",
      "measurement:2",
      "measurement:3",
    ]);
  });

  it("US-MON-01 cuts a long bundle to the limit and counts the rest; the inbox keeps the full list", () => {
    const payload = pushPayload(message(60));
    expect(Buffer.byteLength(payload, "utf8")).toBeLessThanOrEqual(PUSH_PAYLOAD_LIMIT);
    const json = JSON.parse(payload);
    expect(json.items.length).toBeGreaterThan(0);
    expect(json.items.length + json.more).toBe(60);
    expect(json.items[0].id).toBe("measurement:1");
  });
});

describe("US-MON-01 the Web Push channel", () => {
  it("US-MON-01 sends to every subscription and counts as delivered", async () => {
    const { channel, removed } = channelWith({});
    await expect(
      channel.send("anna", message(1), [subscription("a.push"), subscription("b.push")]),
    ).resolves.toBeUndefined();
    expect(removed).toEqual([]);
  });

  it("US-MON-01 removes a subscription the push service answers with 404 or 410, and still delivers to the rest", async () => {
    const gone = subscription("gone.push");
    const unknown = subscription("unknown.push");
    const { channel, removed, lines } = channelWith({ "gone.push": 410, "unknown.push": 404 });
    await channel.send("anna", message(1), [gone, unknown, subscription("ok.push")]);
    expect(removed).toEqual([gone.endpoint, unknown.endpoint]);
    expect(lines.join("\n")).toContain("subscription removed");
    expect(lines.join("\n")).not.toContain(gone.endpoint); // only the host is logged, the path is a capability
  });

  it("FR-MON-08 throws when no subscription takes the push, so the job retries; nothing is removed for a 5xx", async () => {
    const { channel, removed } = channelWith({
      "down.push": 503,
      "broken.push": new Error("connect ECONNREFUSED"),
    });
    await expect(
      channel.send("anna", message(1), [subscription("down.push"), subscription("broken.push")]),
    ).rejects.toThrow(/down\.push answered 503.*broken\.push: connect ECONNREFUSED/);
    expect(removed).toEqual([]);
  });

  it("FR-MON-08 throws when every subscription was gone, so the reminder is not counted as delivered (P-10)", async () => {
    const { channel, removed } = channelWith({ "gone.push": 410 });
    await expect(channel.send("anna", message(1), [subscription("gone.push")])).rejects.toThrow(
      "gone",
    );
    expect(removed).toHaveLength(1);
  });

  it("P-10 a failure next to a delivery is logged, the delivery counts", async () => {
    const { channel, lines } = channelWith({ "down.push": 500 });
    await channel.send("anna", message(1), [subscription("down.push"), subscription("ok.push")]);
    expect(lines.join("\n")).toContain("down.push answered 500");
  });
});

describe("US-MON-01 Web Push configuration from the environment", () => {
  const keys = webpush.generateVAPIDKeys();
  const full = {
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: "mailto:betrieb@example.test",
  };

  it("US-MON-01 is null when no VAPID variable is set, and the stub stays", () => {
    expect(webPushConfigFromEnv({})).toBeNull();
    expect(reminderChannelFromEnv({} as Pool, {})).toBeInstanceOf(StubReminderChannel);
  });

  it("US-MON-01 names what is missing and keeps the stub with a partial configuration", () => {
    expect(webPushConfigFromEnv({ VAPID_PUBLIC_KEY: keys.publicKey })).toEqual([
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
    ]);
    const lines: string[] = [];
    const channel = reminderChannelFromEnv({} as Pool, { VAPID_SUBJECT: "mailto:x@y.test" }, (l) =>
      lines.push(l),
    );
    expect(channel).toBeInstanceOf(StubReminderChannel);
    expect(lines[0]).toContain("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY missing or invalid");
  });

  it("US-MON-01 refuses an invalid key instead of failing at the first send", () => {
    const found = webPushConfigFromEnv({ ...full, VAPID_PRIVATE_KEY: "too-short" });
    expect(Array.isArray(found) && found[0]).toContain("VAPID_* invalid");
  });

  it("US-MON-01 builds the Web Push channel with a full configuration", () => {
    expect(webPushConfigFromEnv(full)).toEqual({
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: "mailto:betrieb@example.test",
    });
    expect(reminderChannelFromEnv({} as Pool, full)).toBeInstanceOf(WebPushReminderChannel);
  });
});

/** Decrypts an aes128gcm push body (RFC 8188, RFC 8291) as the browser would, with its private key and auth secret. */
function decrypt(body: Buffer, browser: ReturnType<typeof createECDH>, authSecret: Buffer): string {
  const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const serverKey = body.subarray(21, 21 + idLength);
  const content = body.subarray(21 + idLength);
  const shared = browser.computeSecret(serverKey);
  const info = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    browser.getPublicKey(),
    serverKey,
    Buffer.from([1]),
  ]);
  const ikm = hmac(hmac(authSecret, shared), info);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(content.subarray(content.length - 16));
  const plain = Buffer.concat([
    decipher.update(content.subarray(0, content.length - 16)),
    decipher.final(),
  ]);
  return plain.subarray(0, plain.lastIndexOf(2)).toString("utf8"); // 0x02 ends the last record, zeros pad it
}

describe("US-MON-01 the sender speaks standard Web Push to the endpoint (RFC 8030, 8291, 8292)", () => {
  let server: Server;
  let base: string;
  let status = 201;
  const received: { path: string; headers: IncomingHttpHeaders; body: Buffer }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        received.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) });
        res.writeHead(status).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("US-MON-01 posts the encrypted payload with VAPID, TTL and urgency; only the browser can read it", async () => {
    const keys = webpush.generateVAPIDKeys();
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const authSecret = randomBytes(16);
    const send = webPushSender({ ...keys, subject: "mailto:betrieb@example.test" });
    const payload = pushPayload(message(2));
    const answer = await send(
      {
        endpoint: `${base}/push/abc`,
        p256dh: browser.getPublicKey().toString("base64url"),
        auth: authSecret.toString("base64url"),
      },
      payload,
    );
    expect(answer).toBe(201);
    const [request] = received;
    expect(request?.path).toBe("/push/abc");
    expect(request?.headers).toMatchObject({
      "content-encoding": "aes128gcm",
      ttl: String(PUSH_TTL_SECONDS),
      urgency: "normal",
    });
    const [token, key] = (request?.headers["authorization"] ?? "").split(", ");
    expect(token).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+$/); // a signed JWT (RFC 8292)
    expect(key).toBe(`k=${keys.publicKey}`);
    expect(request?.body.includes(Buffer.from("PflanzenDex"))).toBe(false);
    expect(decrypt(request?.body ?? Buffer.alloc(0), browser, authSecret)).toBe(payload);
  });

  it("US-MON-01 passes the status of the push service through (410 means the subscription is gone)", async () => {
    status = 410;
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const send = webPushSender({
      ...webpush.generateVAPIDKeys(),
      subject: "mailto:betrieb@example.test",
    });
    const answer = await send(
      {
        endpoint: `${base}/push/old`,
        p256dh: browser.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
      "{}",
    );
    expect(answer).toBe(410);
  });
});

describe("US-MON-01 a dead subscription leaves the database", () => {
  let pool: Pool;
  let admin: Pool;
  const sub = `push-${randomUUID()}`;
  beforeAll(async () => {
    pool = openOwnerPool();
    admin = openFixturePool();
    await migrate(pool);
    const app = createApp({
      pool,
      reviewer: async () => ({ sub, email: `${sub}@example.test`, email_verified: true }),
    });
    await app.request("/account", { headers: { authorization: `Bearer valid:${sub}` } });
  });
  afterAll(async () => {
    await admin.query("delete from account where subject = $1", [sub]);
    await Promise.all([pool.end(), admin.end()]);
  });

  it("US-MON-01 the 410 subscription is deleted, the live one stays and the reminder counts as delivered", async () => {
    const { rows } = await admin.query<{ id: string }>(
      "select id from account where subject = $1",
      [sub],
    );
    const userId = rows[0]?.id as string;
    const channels = new ChannelsPostgres(pool);
    const dead = subscription("gone.push");
    const live = subscription("ok.push");
    await channels.add(userId, dead);
    await channels.add(userId, live);
    const channel = new WebPushReminderChannel({
      send: async (s) => (s.endpoint === dead.endpoint ? 410 : 201),
      channels,
      log: () => undefined,
    });
    await channel.send(userId, message(1), await channels.subscriptions(userId));
    expect((await channels.subscriptions(userId)).map((s) => s.endpoint)).toEqual([live.endpoint]);
  });
});
