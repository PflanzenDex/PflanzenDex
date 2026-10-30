import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createApp } from "../../../src/app.ts";
import type { AppOptions } from "../../../src/app-options.ts";

// Calls the real API in process (the same routes and core operations the web app uses, with row-level security), as one
// account per call. The demo seed never writes SQL of its own: P-03 and P-04 apply to it like to everybody else.
export type Reply = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function parse(res: Response): Promise<Reply["body"]> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

export class Caller {
  private readonly app: ReturnType<typeof createApp>;

  constructor(pool: Pool, emails: ReadonlyMap<string, string>, media?: AppOptions["media"]) {
    this.app = createApp({
      pool,
      invitationOnly: false,
      ...(media ? { media } : {}),
      reviewer: async (token) => {
        const sub = token.replace("valid:", "");
        return { sub, email: emails.get(sub) ?? `${sub}@example.test`, email_verified: true };
      },
    });
  }

  async call(sub: string, method: string, path: string, body?: unknown): Promise<Reply> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer valid:${sub}`,
    };
    if (method !== "GET") headers["idempotency-key"] = randomUUID();
    const res = await this.app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await parse(res) };
  }

  /** Like `call`, but a failure stops the seed with the route and the error body (nothing is swallowed, P-10). */
  async ok(sub: string, method: string, path: string, body?: unknown): Promise<Reply["body"]> {
    const reply = await this.call(sub, method, path, body);
    if (reply.status >= 300)
      throw new Error(`${method} ${path} -> ${reply.status} ${JSON.stringify(reply.body)}`);
    return reply.body;
  }

  /** Uploads raw image bytes as the photo of a measurement (US-WAC-06). */
  async photo(sub: string, specimenId: string, date: string, bytes: Uint8Array): Promise<Reply> {
    const res = await this.app.request(
      `/specimens/${specimenId}/measurements/photo?timeZone=Europe/Berlin&date=${date}`,
      {
        method: "POST",
        headers: {
          "content-type": "image/png",
          authorization: `Bearer valid:${sub}`,
          "idempotency-key": randomUUID(),
        },
        body: bytes as unknown as RequestInit["body"],
      },
    );
    return { status: res.status, body: await parse(res) };
  }
}
