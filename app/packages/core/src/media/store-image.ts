import { appError, failed, ok } from "../kernel";
import type { Result } from "../kernel";
import { objectKey, thumbnailName } from "./keys";
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
 * Upload pipeline (FR-WAC-09, NFR-12): check, process, store the processed image and its thumbnail. The original is passed
 * to the processor only and never reaches the store, so no object with GPS data can exist. Nothing is kept when any step
 * fails (P-03): when the thumbnail cannot be written, the stored copy is taken back and the upload is refused with the
 * store's error, so the caller can retry and no photo is lost silently (P-10).
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
  const { bytes, contentType, width, height, thumbnail } = processed.value;
  const put = await deps.store.put(accountId, name, bytes, contentType);
  if (!put.ok) return put;
  const small = await deps.store.put(
    accountId,
    thumbnailName(name),
    thumbnail.bytes,
    thumbnail.contentType,
  );
  if (small.ok) return ok({ name, width, height });
  await deps.store.delete(accountId, name);
  return small;
}
