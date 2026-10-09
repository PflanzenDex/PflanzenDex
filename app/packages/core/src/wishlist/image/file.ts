import { appError, failed, isId, type Result } from "../../kernel";
import type { WishStore } from "../types";

export interface WishImageFileDependencies {
  readonly wishes: Pick<WishStore, "find">;
  /** Reads a stored object; structurally the `ObjectStore` of `media` (ADR 0003: no edge to `media`). */
  readonly objects: {
    get(
      accountId: string,
      name: string,
    ): Promise<Result<{ readonly bytes: Uint8Array; readonly contentType: string }>>;
  };
}

/**
 * The stored copy of a wish image (US-WUN-04), only for the owner (private by default, P-05). A foreign or unknown wish
 * looks the same (`wish.not_found`, P-04); a wish without a copy is `wish.image_not_found`.
 */
export async function wishImageFile(
  deps: WishImageFileDependencies,
  userId: string,
  wishId: string,
): Promise<Result<{ readonly bytes: Uint8Array; readonly contentType: string }>> {
  if (!isId(wishId)) return failed(appError("wish.not_found"));
  const wish = await deps.wishes.find(userId, wishId.toLowerCase());
  if (!wish) return failed(appError("wish.not_found"));
  if (!wish.imageObject) return failed(appError("wish.image_not_found"));
  return deps.objects.get(userId, wish.imageObject);
}
