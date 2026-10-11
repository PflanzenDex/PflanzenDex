import {
  appError,
  defineOperation,
  failed,
  idField,
  ok,
  shape,
  type Result,
  type SourceClient,
} from "../../kernel";
import type { WishRow, WishStore } from "../types";
import { commonsRequest, commonsTitle, readCommons } from "./commons";

/** The raw image from Wikimedia, downloaded by the adapter (host, size and time are limited there). */
export interface ImageDownload {
  get(url: string): Promise<Result<{ readonly bytes: Uint8Array; readonly contentType: string }>>;
}

/**
 * What the wishlist needs from the media pipeline (structurally `ImageStorage` of `media`, ADR 0003): process and store
 * an upload, delete a stored image.
 */
export interface WishImageStorage {
  put(
    accountId: string,
    name: string,
    upload: { readonly bytes: Uint8Array; readonly contentType: string },
  ): Promise<Result<unknown>>;
  remove(accountId: string, name: string): Promise<Result<unknown>>;
}

export interface WishImageDependencies {
  readonly wishes: Pick<WishStore, "find" | "setImage">;
  readonly sources: SourceClient;
  readonly download: ImageDownload;
  readonly storage: WishImageStorage;
  /** A new, unique object name without extension; randomness comes from outside. */
  readonly newName: () => string;
}

export interface WishImageResult {
  readonly wish: WishRow;
  /** `false`: the image was stored already, nothing was fetched or written again. */
  readonly changed: boolean;
}

const schema = shape({ wishId: idField("wishId") });

type Verified = { readonly downloadUrl: string; readonly license: string; readonly source: string };

/** Looks the file up at Commons and reads address, license and source; nothing is downloaded yet. */
async function verify(deps: WishImageDependencies, wish: WishRow): Promise<Result<Verified>> {
  const title = wish.imageUrl ? commonsTitle(wish.imageUrl) : null;
  if (!title) return failed(appError("wish.image_source_unsupported"));
  const looked = await deps.sources.get(commonsRequest(title));
  if (!looked.ok) return looked;
  if (looked.value.kind === "not_found") return failed(appError("wish.image_not_found"));
  const read = readCommons(looked.value.data);
  if (read.ok) return ok(read.file);
  return failed(
    appError(
      read.reason === "not_found" ? "wish.image_not_found" : "wish.image_license_unsupported",
    ),
  );
}

/**
 * Stores a local copy of the wish's image (US-WUN-04, P-05: a viewer never loads a foreign address). Only Wikimedia
 * Commons is accepted: the address names a Commons file, its metadata come from the Commons API through the source
 * client (TE-09), the license must allow storing (public domain, CC0, CC BY, CC BY-SA) and the original is downloaded
 * from Wikimedia only. The processed copy (TE-05: JPEG, at most 1600 px, no metadata) is stored under a new name and
 * the wish records the verified source and license; the original is never kept. Nothing is guessed: an image without
 * a readable license is refused (P-08). An image that is stored already is kept. A wish of another account looks
 * unknown (`wish.not_found`, P-04).
 */
export const wishStoreImage = (deps: WishImageDependencies) =>
  defineOperation({
    name: "wish.store_image",
    schema,
    run: async ({ userId }, input) => {
      const wish = await deps.wishes.find(userId, input.wishId);
      if (!wish) return failed(appError("wish.not_found"));
      if (wish.imageObject) return ok<WishImageResult>({ wish, changed: false });
      const file = await verify(deps, wish);
      if (!file.ok) return file;
      const original = await deps.download.get(file.value.downloadUrl);
      if (!original.ok) return original;
      const name = `${deps.newName()}.jpg`;
      const stored = await deps.storage.put(userId, name, original.value);
      if (!stored.ok) return stored;
      const image = { object: name, source: file.value.source, license: file.value.license };
      const updated = await deps.wishes.setImage(userId, wish.id, image);
      if (updated) return ok<WishImageResult>({ wish: updated, changed: true });
      await deps.storage.remove(userId, name);
      return failed(appError("wish.not_found"));
    },
  });
