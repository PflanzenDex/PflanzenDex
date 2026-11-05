import { describe, expect, it } from "vitest";
import { createS3ObjectStore } from "./index";
import type { S3Config } from "./index";

// TE-05: the S3 adapter against a scripted client (no network): key mapping, error mapping. Real S3: s3-store.test.ts.
const config: S3Config = {
  bucket: "b",
  region: "eu-central-1",
  accessKeyId: "id",
  secretAccessKey: "secret",
  forcePathStyle: true,
};
const A = "11111111-1111-4111-8111-111111111111";
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1]); // "RIFF": a WebP container
const named = (name: string) => Object.assign(new Error(name), { name });

type Command = { constructor: { name: string }; input: { Bucket: string; Key: string } };

function scripted(reply: (command: Command) => unknown) {
  const sent: { type: string; input: Command["input"] }[] = [];
  const client = {
    send: async (command: Command) => {
      sent.push({ type: command.constructor.name, input: command.input });
      return reply(command);
    },
  };
  return { sent, store: createS3ObjectStore(config, client as never) };
}

describe("TE-05 S3 adapter with a scripted client", () => {
  it("QG-D3 every request uses the account-scoped key and the configured bucket", async () => {
    const { sent, store } = scripted((c) =>
      c.constructor.name === "GetObjectCommand"
        ? { Body: { transformToByteArray: async () => webp }, ContentType: "image/webp" }
        : {},
    );
    await store.put(A, "x.webp", webp, "image/webp");
    await store.get(A, "x.webp");
    await store.exists(A, "x.webp");
    await store.delete(A, "x.webp");
    expect(sent.map((s) => [s.type, s.input.Bucket, s.input.Key])).toEqual(
      ["PutObjectCommand", "GetObjectCommand", "HeadObjectCommand", "DeleteObjectCommand"].map(
        (t) => [t, "b", `${A}/x.webp`],
      ),
    );
  });

  it("US-ACC-04 deleteAll lists the account prefix page by page and removes what it finds", async () => {
    let page = 0;
    const { sent, store } = scripted((c) => {
      if (c.constructor.name === "ListObjectsV2Command") {
        page += 1;
        return page === 1
          ? { Contents: [{ Key: `${A}/a.webp` }], IsTruncated: true, NextContinuationToken: "t" }
          : { Contents: [{ Key: `${A}/b.webp` }, { Key: `${A}/c.webp` }], IsTruncated: false };
      }
      return {};
    });
    expect(await store.deleteAll(A)).toEqual({ ok: true, value: 3 });
    const lists = sent.filter((s) => s.type === "ListObjectsV2Command");
    expect(lists.map((l) => (l.input as unknown as { Prefix: string }).Prefix)).toEqual([
      `${A}/`,
      `${A}/`,
    ]);
    expect(sent.filter((s) => s.type === "DeleteObjectsCommand")).toHaveLength(2);
  });

  it("US-ACC-04 deleteAll does not report success when the store could not remove an object", async () => {
    const { store } = scripted((c) =>
      c.constructor.name === "ListObjectsV2Command"
        ? { Contents: [{ Key: `${A}/a.webp` }] }
        : { Errors: [{ Key: `${A}/a.webp` }] },
    );
    const r = await store.deleteAll(A);
    expect(!r.ok && r.error.code).toBe("media.storage_unavailable");
  });

  it("maps a missing object to media.not_found and exists=false", async () => {
    const { store } = scripted(() => {
      throw named("NoSuchKey");
    });
    const got = await store.get(A, "x.webp");
    expect(!got.ok && got.error.code).toBe("media.not_found");
    expect(await store.exists(A, "x.webp")).toEqual({ ok: true, value: false });
  });

  it("maps any other failure to media.storage_unavailable and keeps the cause out of the text", async () => {
    const { store } = scripted(() => {
      throw named("ServiceUnavailable");
    });
    for (const r of [
      await store.put(A, "x.webp", webp, "image/webp"),
      await store.delete(A, "x.webp"),
    ])
      expect(!r.ok && r.error.code).toBe("media.storage_unavailable");
    const got = await store.get(A, "x.webp");
    expect(!got.ok && got.error.text).not.toContain("ServiceUnavailable");
  });

  it("treats an empty body as storage_unavailable, never as an empty image", async () => {
    const { store } = scripted(() => ({}));
    const got = await store.get(A, "x.webp");
    expect(!got.ok && got.error.code).toBe("media.storage_unavailable");
  });

  it("refuses an invalid name before any request", async () => {
    const { sent, store } = scripted(() => ({}));
    const r = await store.put(A, "../x.webp", webp, "image/webp");
    expect(!r.ok && r.error.code).toBe("media.name_invalid");
    expect(sent).toEqual([]);
  });
});
