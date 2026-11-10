// Entry point of the one-shot `object-store-bucket` (docker-compose.store.yml, US-WAC-06): creates the photo bucket before
// the API starts. Reads the S3_* variables the way the API does. It prints names and the bucket, never a secret value.
import { ensureBucket } from "./ensure-bucket";
import { s3ConfigFromEnv } from "./s3-store";
import type { S3Config } from "./s3-store";

const fail = (message: string) => {
  console.error(`ERROR: ensure-bucket: ${message}`);
  process.exitCode = 1;
};

const found = s3ConfigFromEnv(process.env);
if (found === null) {
  fail(
    "no S3_* variable is set; S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required",
  );
} else if (Array.isArray(found)) {
  fail(`missing ${found.join(", ")}`);
} else {
  const config = found as S3Config;
  try {
    await ensureBucket(config);
    console.log(`ensure-bucket: bucket ${config.bucket} is ready`);
  } catch (error) {
    fail(error instanceof Error ? error.message : "unknown error");
  }
}
