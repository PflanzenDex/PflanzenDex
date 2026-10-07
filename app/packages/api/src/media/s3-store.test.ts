import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { MEDIA_LIMITS } from "@pflanzendex/core";
import { createS3Client, createS3ObjectStore, s3ConfigFromEnv } from "./index";
import type { S3Config } from "./index";

describe("TE-05 S3 configuration from the environment", () => {
  const full = {
    S3_BUCKET: "b",
    S3_REGION: "eu-central-1",
    S3_ACCESS_KEY_ID: "id",
    S3_SECRET_ACCESS_KEY: "secret",
  };

  it("is null when no S3 variable is set (storage not configured)", () => {
    expect(s3ConfigFromEnv({})).toBeNull();
  });

  it("names every missing required variable instead of building a half config", () => {
    expect(s3ConfigFromEnv({ S3_ENDPOINT: "http://localhost:9000", S3_BUCKET: "b" })).toEqual([
      "S3_REGION",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
    ]);
  });

  it("uses path-style addressing by default only with a custom endpoint", () => {
    expect(s3ConfigFromEnv(full)).toMatchObject({ forcePathStyle: false });
    expect(s3ConfigFromEnv({ ...full, S3_ENDPOINT: "http://localhost:9000" })).toMatchObject({
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
    });
    expect(s3ConfigFromEnv({ ...full, S3_FORCE_PATH_STYLE: "true" })).toMatchObject({
      forcePathStyle: true,
    });
  });
});

// Real S3 (MinIO, see app/dev/storage.compose.yaml). Without S3_* in the environment, or when the endpoint does not
// answer, the block below is reported as skipped with the reason in its name; it never passes silently (P-10).
const found = s3ConfigFromEnv(process.env);
const config: S3Config | null = found && !Array.isArray(found) ? (found as S3Config) : null;
async function reachable(c: S3Config | null): Promise<boolean> {
  if (!c?.endpoint) return c !== null;
  try {
    await fetch(c.endpoint, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}
const live = await reachable(config);
const why = !config ? "S3_* variables not set" : !live ? `${config.endpoint} not reachable` : "";

describe.skipIf(!live)(
  why
    ? `TE-05 S3 adapter against MinIO (SKIPPED: ${why}; start MinIO, see app/dev/storage.compose.yaml)`
    : "TE-05 S3 adapter against MinIO",
  () => {
    const a = randomUUID();
    const b = randomUUID();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);
    const store = () => createS3ObjectStore(config as S3Config);

    beforeAll(async () => {
      const c = config as S3Config;
      const client = createS3Client(c);
      await client.send(new CreateBucketCommand({ Bucket: c.bucket })).catch((e: Error) => {
        if (!/BucketAlready/.test(e.name)) throw e;
      });
    });

    it("stores, reads, probes and deletes an object with its content type", async () => {
      const s = store();
      await s.put(a, "round.jpg", jpeg, MEDIA_LIMITS.storedType);
      const read = await s.get(a, "round.jpg");
      expect(read.ok && [...read.value.bytes, read.value.contentType]).toEqual([
        ...jpeg,
        "image/jpeg",
      ]);
      expect(await s.exists(a, "round.jpg")).toEqual({ ok: true, value: true });
      await s.delete(a, "round.jpg");
      expect(await s.exists(a, "round.jpg")).toEqual({ ok: true, value: false });
      const gone = await s.get(a, "round.jpg");
      expect(!gone.ok && gone.error.code).toBe("media.not_found");
    });

    it("QG-D3 account A cannot read, probe or delete account B's object, also not by traversal", async () => {
      const s = store();
      await s.put(b, "private.jpg", jpeg, MEDIA_LIMITS.storedType);
      const foreign = await s.get(a, "private.jpg");
      expect(!foreign.ok && foreign.error.code).toBe("media.not_found");
      expect(await s.exists(a, "private.jpg")).toEqual({ ok: true, value: false });
      await s.delete(a, "private.jpg");
      const sneak = await s.get(a, `../${b}/private.jpg`);
      expect(!sneak.ok && sneak.error.code).toBe("media.name_invalid");
      expect((await s.get(b, "private.jpg")).ok).toBe(true);
      await s.delete(b, "private.jpg");
    });

    it("TE-05 an oversize object or a non-image type is refused before any request", async () => {
      const s = store();
      const big = await s.put(
        a,
        "big.jpg",
        new Uint8Array(MEDIA_LIMITS.storedMaxBytes + 1),
        "image/jpeg",
      );
      expect(!big.ok && big.error.code).toBe("media.too_large");
      const html = await s.put(a, "x.jpg", jpeg, "text/html");
      expect(!html.ok && html.error.code).toBe("media.type_unsupported");
    });
  },
);

it.skipIf(live)("TE-05 S3 adapter tests need MinIO: they are skipped, not passed", () => {
  console.info(`S3 adapter tests skipped (${why})`);
});
