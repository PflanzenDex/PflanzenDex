// Research through the AI client (US-KI-05): the server checks an image address for reachability and license
// (operation `check_image_source`). The client cannot claim an image as checked (KI-R1, P-08); only Wikimedia Commons is
// looked up, so a client-supplied address never makes the server contact another host.
import { appError, failed, ok, type Result } from "../../kernel";
import { mayCall, type AiRights } from "../rights";
import type { AiLogStore } from "../status";

/** The check behind a port, so `ai` does not depend on the module `wishlist` (structurally `checkCommonsImage` bound to the source client). */
export interface ImageSourceChecker {
  check(
    address: string | null,
  ): Promise<Result<{ readonly license: string; readonly source: string }>>;
}

export interface ImageSourceCall {
  readonly userId: string;
  readonly connectionId: string;
  readonly rights: AiRights;
  readonly now: Date;
  readonly imageUrl: unknown;
}

/** What the server found out: the license and the source line as they are stored with a wish image. */
export interface CheckedImageSource {
  readonly checked: true;
  readonly license: string;
  readonly source: string;
}

/** Read right; the call is logged without content (P-10). A refusal carries the code of the wish image (`wish.image_*`). */
export async function aiCheckImageSource(
  deps: { readonly images: ImageSourceChecker; readonly log: AiLogStore },
  call: ImageSourceCall,
): Promise<Result<CheckedImageSource>> {
  if (!mayCall(call.rights, "check_image_source")) return failed(appError("ai.scope_insufficient"));
  const address =
    typeof call.imageUrl === "string" && call.imageUrl.length <= 500 ? call.imageUrl : null;
  const r = await deps.images.check(address);
  await deps.log.record(
    call.userId,
    {
      connectionId: call.connectionId,
      operation: "check_image_source",
      effect: r.ok ? "read: image source checked" : `read: image source refused (${r.error.code})`,
    },
    call.now,
  );
  return r.ok ? ok({ checked: true, license: r.value.license, source: r.value.source }) : r;
}
