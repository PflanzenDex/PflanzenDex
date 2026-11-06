import { CreateBucketCommand } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import { createS3Client } from "./s3-store";
import type { S3Config } from "./s3-store";

// US-WAC-06: the photo bucket exists before the API starts (docker-compose.store.yml, one-shot `object-store-bucket`).
// Starting values (assumption): 30 tries, 2 s apart, about one minute for a store that starts slowly.
export const ENSURE_BUCKET_ATTEMPTS = 30;
export const ENSURE_BUCKET_DELAY_MS = 2000;

export interface EnsureBucketOptions {
  readonly attempts?: number;
  readonly delayMs?: number;
  /** The pause between two tries: the real timer by default, a fake in the tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

// The bucket is there already (an earlier run, or another one): that is all the app needs.
const EXISTS = new Set(["BucketAlreadyOwnedByYou", "BucketAlreadyExists"]);
// The store answered and refused the key: a retry would not change that.
const REFUSED = new Set([
  "AccessDenied",
  "AccessDeniedException",
  "AuthorizationHeaderMalformed",
  "ExpiredToken",
  "InvalidAccessKeyId",
  "InvalidToken",
  "SignatureDoesNotMatch",
]);

// HTTP status from this code on: a server error, which may pass while the store starts.
const HTTP_SERVER_ERROR = 500;

const waitFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The name and the HTTP status of an SDK error; never its message, which may carry a secret. */
function failureOf(cause: unknown): { name: string; status: number | undefined } {
  const error = (cause ?? {}) as { name?: string; $metadata?: { httpStatusCode?: number } };
  return { name: error.name ?? "unknown error", status: error.$metadata?.httpStatusCode };
}

/** The message of a failure that a retry cannot change (refused or rejected), `undefined` for the others. */
function permanentMessage(
  where: string,
  bucket: string,
  name: string,
  status: number | undefined,
): string | undefined {
  if (REFUSED.has(name) || status === 401 || status === 403) {
    return `The object store at ${where} refused the access key (${name}); check S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.`;
  }
  if (status !== undefined && status < HTTP_SERVER_ERROR) {
    return `The object store at ${where} rejected bucket ${bucket} (${name}, HTTP ${status}).`;
  }
  return undefined;
}

/**
 * Creates `config.bucket` when it is missing; idempotent (US-WAC-06). A store that does not answer yet (no response, or
 * a server error) is asked again; an authorization error, or any other answer below 500, fails at once. The messages
 * name the errors and the endpoint, never the secret and never the raw error text (P-10: nothing hides, nothing leaks).
 */
export async function ensureBucket(
  config: S3Config,
  client: Pick<S3Client, "send"> = createS3Client(config),
  options: EnsureBucketOptions = {},
): Promise<void> {
  const attempts = options.attempts ?? ENSURE_BUCKET_ATTEMPTS;
  const delayMs = options.delayMs ?? ENSURE_BUCKET_DELAY_MS;
  const sleep = options.sleep ?? waitFor;
  const where = config.endpoint ?? `AWS region ${config.region}`;
  let last = "no answer";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
      return;
    } catch (cause) {
      const { name, status } = failureOf(cause);
      if (EXISTS.has(name)) return;
      const message = permanentMessage(where, config.bucket, name, status);
      if (message) throw new Error(message, { cause });
      last = name;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw new Error(
    `The object store at ${where} did not answer after ${attempts} tries (last error: ${last}); start it or check S3_ENDPOINT.`,
  );
}
