import type { Result } from "../kernel";
import { thumbnailName } from "./keys";
import { storeImage } from "./store-image";
import type { StoreImageDependencies } from "./store-image";
import type { ImageSize, ObjectStore, StoredObject } from "./types";

/** Reads a stored image in the size asked (NFR-12). Structurally the port `care` takes for photo reads (ADR 0003). */
export interface ImageReader {
  /**
   * `thumb` answers the thumbnail. An upload that has none (stored before NFR-12) answers the stored copy instead, so the
   * caller never gets not found for a photo that exists; no backfill is needed for that. Every read is account-scoped.
   */
  read(accountId: string, name: string, size: ImageSize): Promise<Result<StoredObject>>;
}

/** The reader on an object store: the thumbnail first, the stored copy only when no thumbnail exists. */
export const imageReader = (store: ObjectStore): ImageReader => ({
  read: async (accountId, name, size) => {
    if (size === "full") return store.get(accountId, name);
    const small = await store.get(accountId, thumbnailName(name));
    if (small.ok || small.error.code !== "media.not_found") return small;
    return store.get(accountId, name);
  },
});

/**
 * The part of the media pipeline that other modules need (US-WAC-06): process and store an upload, read or delete a
 * stored image with its thumbnail. Modules that keep photos take this small port instead of importing `media` (ADR
 * 0003: edges are explicit); the API composes it from the object store and the processor.
 */
export interface ImageStorage extends ImageReader {
  /** Checks, processes and stores the upload under `name` with its thumbnail (see `storeImage`); nothing is stored on failure. */
  put(
    accountId: string,
    name: string,
    upload: { readonly bytes: Uint8Array; readonly contentType: string },
  ): Promise<Result<{ readonly width: number; readonly height: number }>>;
  /** Deletes the stored image and its thumbnail; deleting a missing one succeeds. */
  remove(accountId: string, name: string): Promise<Result<void>>;
}

export const imageStorage = (deps: StoreImageDependencies): ImageStorage => ({
  ...imageReader(deps.store),
  put: async (accountId, name, upload) => {
    const r = await storeImage(deps, accountId, name, upload);
    return r.ok ? { ok: true, value: { width: r.value.width, height: r.value.height } } : r;
  },
  remove: async (accountId, name) => {
    const full = await deps.store.delete(accountId, name);
    return full.ok ? deps.store.delete(accountId, thumbnailName(name)) : full;
  },
});
