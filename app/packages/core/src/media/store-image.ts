import { appError, failed, ok } from "../kernel";
import type { Result } from "../kernel";
import { objectKey } from "./keys";
import { MEDIA_LIMITS } from "./types";
import type { ImageProcessor, ObjectStore } from "./types";

export interface StoreImageDependencies {
  readonly store: ObjectStore;
  readonly processor: ImageProcessor;
}

export interface StoredImage {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Upload pipeline (FR-WAC-09): check, process, store the processed image. The original is passed to the processor only
 * and never reaches the store, so no object with GPS data can exist. Nothing is written when any step fails (P-03).
 */
export async function storeImage(
  deps: StoreImageDependencies,
  accountId: string,
  name: string,
  upload: { readonly bytes: Uint8Array; readonly contentType: string },
): Promise<Result<StoredImage>> {
  const key = objectKey(accountId, name);
  if (!key.ok) return key;
  if (upload.bytes.byteLength > MEDIA_LIMITS.uploadMaxBytes)
    return failed(appError("media.too_large"));
  if (!(MEDIA_LIMITS.uploadTypes as readonly string[]).includes(upload.contentType))
    return failed(appError("media.type_unsupported"));
  const processed = await deps.processor.process(upload.bytes);
  if (!processed.ok) return processed;
  const { bytes, contentType, width, height } = processed.value;
  const put = await deps.store.put(accountId, name, bytes, contentType);
  return put.ok ? ok({ name, width, height }) : put;
}
