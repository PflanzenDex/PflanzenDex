// Public interface of the media adapters (TE-05): image processing with sharp, S3-compatible object store.
export { createSharpProcessor } from "./sharp-processor";
export { createS3Client, createS3ObjectStore, s3ConfigFromEnv } from "./s3-store";
export type { S3Config } from "./s3-store";
