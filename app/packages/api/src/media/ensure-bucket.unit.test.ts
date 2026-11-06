import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureBucket } from "./ensure-bucket";
import type { S3Config } from "./s3-store";

// US-WAC-06: the bucket of the photos is created before the API starts, without a real store (scripted client).
const SECRET = "SECRET-VALUE-123";
const config: S3Config = {
  bucket: "pflanzendex-photos",
  region: "eu-central-1",
  accessKeyId: "pflanzendex",
  secretAccessKey: SECRET,
  endpoint: "http://object-store:9000",
  forcePathStyle: true,
};

/** An error as the SDK throws it; its raw text carries the secret on purpose, the messages of the code must not. */
const failure = (name: string, httpStatusCode?: number) =>
  Object.assign(new Error(`${name}: raw text with ${SECRET}`), {
    name,
    $metadata: httpStatusCode === undefined ? {} : { httpStatusCode },
  });

type Command = { constructor: { name: string }; input: { Bucket: string } };

/** Scripted store: the n-th request gets the n-th reply (a value, or an error to throw). The last reply repeats. */
function scripted(replies: readonly unknown[]) {
  const sent: Command[] = [];
  const waits: number[] = [];
  const client = {
    send: async (command: Command) => {
      sent.push(command);
      const reply = replies[Math.min(sent.length, replies.length) - 1];
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  const sleep = async (ms: number) => {
    waits.push(ms);
  };
  return { sent, waits, client, sleep };
}

const unreachable = () => failure("Error");

describe("US-WAC-06 ensureBucket", () => {
  it("US-WAC-06 creates the configured bucket when it is missing", async () => {
    const { sent, waits, client, sleep } = scripted([{}]);
    await ensureBucket(config, client as never, { sleep });
    expect(sent.map((c) => [c.constructor.name, c.input.Bucket])).toEqual([
      ["CreateBucketCommand", "pflanzendex-photos"],
    ]);
    expect(waits).toEqual([]);
  });

  it.each(["BucketAlreadyOwnedByYou", "BucketAlreadyExists"])(
    "US-WAC-06 a bucket that already exists (%s) counts as done, without a retry",
    async (name) => {
      const { sent, waits, client, sleep } = scripted([failure(name, 409)]);
      await expect(ensureBucket(config, client as never, { sleep })).resolves.toBeUndefined();
      expect(sent).toHaveLength(1);
      expect(waits).toEqual([]);
    },
  );

  it("US-WAC-06 retries while the store does not answer and succeeds once it does", async () => {
    const { sent, waits, client, sleep } = scripted([
      unreachable(),
      failure("ServiceUnavailable", 503),
      {},
    ]);
    await ensureBucket(config, client as never, { sleep });
    expect(sent).toHaveLength(3);
    // Starting values (assumption): 2 s between two tries.
    expect(waits).toEqual([2000, 2000]);
  });

  it("US-WAC-06 gives up after 30 tries with a message that names the endpoint and the limit", async () => {
    const { sent, waits, client, sleep } = scripted([unreachable()]);
    const error = await ensureBucket(config, client as never, { sleep }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/did not answer after 30 tries/);
    expect((error as Error).message).toContain("http://object-store:9000");
    expect(sent).toHaveLength(30);
    expect(waits).toHaveLength(29);
  });

  it.each([
    ["AccessDenied", 403],
    ["SignatureDoesNotMatch", 403],
    ["InvalidAccessKeyId", 403],
  ])(
    "US-WAC-06 an authorization error (%s) fails at once, without a retry",
    async (name, status) => {
      const { sent, waits, client, sleep } = scripted([failure(name, status)]);
      const error = await ensureBucket(config, client as never, { sleep }).catch((e: Error) => e);
      expect((error as Error).message).toMatch(/refused the access key/);
      expect((error as Error).message).toContain(name);
      expect(sent).toHaveLength(1);
      expect(waits).toEqual([]);
    },
  );

  it("US-WAC-06 a rejected request that is not an authorization error (invalid bucket name) fails at once", async () => {
    const { sent, waits, client, sleep } = scripted([failure("InvalidBucketName", 400)]);
    const error = await ensureBucket(config, client as never, { sleep }).catch((e: Error) => e);
    expect((error as Error).message).toContain("InvalidBucketName");
    expect(sent).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("US-WAC-06 the secret never appears in a message, whatever the failure", async () => {
    const outcomes: unknown[][] = [
      [failure("AccessDenied", 403)],
      [failure("InvalidBucketName", 400)],
      [unreachable()],
    ];
    for (const replies of outcomes) {
      const { client, sleep } = scripted(replies);
      const error = await ensureBucket(config, client as never, { sleep }).catch((e: Error) => e);
      expect((error as Error).message).not.toContain(SECRET);
    }
  });

  it("US-WAC-06 the attempts and the pause can be set by the caller", async () => {
    const { sent, waits, client, sleep } = scripted([unreachable()]);
    await expect(
      ensureBucket(config, client as never, { sleep, attempts: 2, delayMs: 5 }),
    ).rejects.toThrow(/did not answer after 2 tries/);
    expect(sent).toHaveLength(2);
    expect(waits).toEqual([5]);
  });
});

// The one-shot of docker-compose.store.yml runs the CLI: it reads the S3_* variables and exits 1 with the names that are
// missing. Spawned, so the real entry point is tested; no store is reached because the config is incomplete.
describe("US-WAC-06 bucket CLI", () => {
  const cli = join(import.meta.dirname, "ensure-bucket-cli.ts");
  const run = (env: NodeJS.ProcessEnv) =>
    spawnSync("npx", ["tsx", cli], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "", ...env },
      timeout: 60_000,
    });

  it("US-WAC-06 exits 1 with a message when no S3 variable is set", () => {
    const r = run({});
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/ERROR: ensure-bucket: no S3_\* variable is set/);
  });

  it("US-WAC-06 names the missing variables and never prints the secret", () => {
    const r = run({ S3_SECRET_ACCESS_KEY: SECRET, S3_BUCKET: "pflanzendex-photos" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("missing S3_REGION, S3_ACCESS_KEY_ID");
    expect(r.stdout + r.stderr).not.toContain(SECRET);
  });
});
