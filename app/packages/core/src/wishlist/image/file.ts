import { appError, failed, isId, photoSize, type PhotoSize, type Result } from "../../kernel";
import type { WishStore } from "../types";

export interface WishImageFileDependencies {
  readonly wishes: Pick<WishStore, "find">;
  /** Reads a stored image in a size; structurally the `ImageReader` of `media` (ADR 0003: no edge to `media`). */
  readonly images: {
    read(
      accountId: string,
      name: string,
      size: PhotoSize,
    ): Promise<Result<{ readonly bytes: Uint8Array; readonly contentType: string }>>;
  };
}

/**
 * The stored copy of a wish image (US-WUN-04), only for the owner (private by default, P-05), in the size asked (NFR-12):
 * no `size` is the copy, exactly one `thumb` the 256 px thumbnail that the wish cards ask for. Any other size is
 * `input.invalid` before a read. A foreign or unknown wish looks the same (`wish.not_found`, P-04); a wish without a copy
 * is `wish.image_not_found`.
 */
export async function wishImageFile(
  deps: WishImageFileDependencies,
  userId: string,
  wishId: string,
  sizes: readonly string[] = [],
): Promise<Result<{ readonly bytes: Uint8Array; readonly contentType: string }>> {
  const wanted = photoSize(sizes);
  if (!wanted.ok) return wanted;
  if (!isId(wishId)) return failed(appError("wish.not_found"));
  const wish = await deps.wishes.find(userId, wishId.toLowerCase());
  if (!wish) return failed(appError("wish.not_found"));
  if (!wish.imageObject) return failed(appError("wish.image_not_found"));
  return deps.images.read(userId, wish.imageObject, wanted.value);
}
