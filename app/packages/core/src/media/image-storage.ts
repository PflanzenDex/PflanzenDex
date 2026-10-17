import type { Result } from "../kernel";
import { storeImage } from "./store-image";
import type { StoreImageDependencies } from "./store-image";

/**
 * The part of the media pipeline that other modules need (US-WAC-06): process and store an upload, delete a stored
 * image. Modules that keep photos take this small port instead of importing `media` (ADR 0003: edges are explicit);
 * the API composes it from the object store and the processor.
 */
export interface ImageStorage {
  /** Checks, processes and stores the upload under `name` (see `storeImage`); nothing is stored on failure. */
  put(
    accountId: string,
    name: string,
    upload: { readonly bytes: Uint8Array; readonly contentType: string },
  ): Promise<Result<{ readonly width: number; readonly height: number }>>;
  /** Deletes the stored image; deleting a missing one succeeds. */
  remove(accountId: string, name: string): Promise<Result<void>>;
}

export const imageStorage = (deps: StoreImageDependencies): ImageStorage => ({
  put: async (accountId, name, upload) => {
    const r = await storeImage(deps, accountId, name, upload);
    return r.ok ? { ok: true, value: { width: r.value.width, height: r.value.height } } : r;
  },
  remove: (accountId, name) => deps.store.delete(accountId, name),
});
