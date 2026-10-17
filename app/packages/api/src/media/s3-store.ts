import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { appError, failed, objectKey, ok, putKey } from "@pflanzendex/core";
import type { ObjectStore, Result } from "@pflanzendex/core";

/** Connection to any S3-compatible host (MinIO in development, an EU provider later). Provider-neutral (TE-03 open). */
export interface S3Config {
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Unset for AWS-style hosts; set for MinIO and other S3 compatible endpoints. */
  readonly endpoint?: string;
  /** Path-style addressing (`endpoint/bucket/key`), default on when an endpoint is set. */
  readonly forcePathStyle: boolean;
}

/**
 * Reads the configuration from the environment: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (required),
 * S3_ENDPOINT, S3_FORCE_PATH_STYLE (optional). No defaults for secrets, nothing in the repo. Returns the names that are
 * missing instead of a half-built config; `null` when none of the S3_* variables is set (storage not configured).
 */
export function s3ConfigFromEnv(env: NodeJS.ProcessEnv): S3Config | readonly string[] | null {
  const required = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
  if (![...required, "S3_ENDPOINT"].some((name) => env[name])) return null;
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) return missing;
  const endpoint = env["S3_ENDPOINT"] || undefined;
  return {
    bucket: env["S3_BUCKET"] as string,
    region: env["S3_REGION"] as string,
    accessKeyId: env["S3_ACCESS_KEY_ID"] as string,
    secretAccessKey: env["S3_SECRET_ACCESS_KEY"] as string,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: env["S3_FORCE_PATH_STYLE"] ? env["S3_FORCE_PATH_STYLE"] === "true" : !!endpoint,
  };
}

const isMissing = (cause: unknown) => {
  const e = cause as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
};
const unavailable = (cause: unknown) => failed(appError("media.storage_unavailable", { cause }));

export const createS3Client = (config: S3Config) =>
  new S3Client({
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });

/** Removes every object below the prefix, page by page; throws if the store reports an object it could not remove (P-10). */
async function removePrefix(client: Pick<S3Client, "send">, Bucket: string, Prefix: string) {
  let removed = 0;
  let ContinuationToken: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
    const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (keys.length > 0) {
      const done = await client.send(
        new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }),
      );
      if ((done.Errors ?? []).length > 0) throw new Error("object removal failed");
      removed += keys.length;
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return removed;
}

/** `ObjectStore` on S3. The key is always `objectKey(accountId, name)`: one account can never address another's object. */
export function createS3ObjectStore(
  config: S3Config,
  client: Pick<S3Client, "send"> = createS3Client(config),
): ObjectStore {
  const Bucket = config.bucket;
  const run = async <T>(
    key: Result<string>,
    act: (Key: string) => Promise<T>,
    onMissing?: () => Result<T>,
  ): Promise<Result<T>> => {
    if (!key.ok) return key;
    try {
      return ok(await act(key.value));
    } catch (cause) {
      return isMissing(cause) && onMissing ? onMissing() : unavailable(cause);
    }
  };
  return {
    put: (accountId, name, bytes, contentType) =>
      run(putKey(accountId, name, bytes, contentType), async (Key) => {
        await client.send(
          new PutObjectCommand({ Bucket, Key, Body: bytes, ContentType: contentType }),
        );
      }),
    get: (accountId, name) =>
      run(
        objectKey(accountId, name),
        async (Key) => {
          const out = await client.send(new GetObjectCommand({ Bucket, Key }));
          const bytes = await out.Body?.transformToByteArray();
          if (!bytes) throw new Error("empty body");
          return { bytes, contentType: out.ContentType ?? "application/octet-stream" };
        },
        () => failed(appError("media.not_found")),
      ),
    delete: (accountId, name) =>
      run(objectKey(accountId, name), async (Key) => {
        await client.send(new DeleteObjectCommand({ Bucket, Key }));
      }),
    deleteAll: (accountId) =>
      run(objectKey(accountId, "x.jpg"), (probe) =>
        removePrefix(client, Bucket, probe.slice(0, probe.length - "x.jpg".length)),
      ),
    exists: (accountId, name) =>
      run(
        objectKey(accountId, name),
        async (Key) => {
          await client.send(new HeadObjectCommand({ Bucket, Key }));
          return true;
        },
        () => ok(false),
      ),
  };
}
