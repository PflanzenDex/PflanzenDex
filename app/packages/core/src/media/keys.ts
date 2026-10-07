import { appError, failed, isId, ok } from "../kernel";
import type { Result } from "../kernel";
import { MEDIA_LIMITS } from "./types";

/**
 * The only way to build an object key: `<account id>/<name>`. The account id must be a UUID and the name has no slash
 * or dots, so no input can leave the account's prefix (P-04, QG-D3). Adapters use nothing else as a key.
 */
export function objectKey(accountId: string, name: string): Result<string> {
  if (!isId(accountId) || !MEDIA_LIMITS.namePattern.test(name))
    return failed(appError("media.name_invalid"));
  return ok(`${accountId.toLowerCase()}/${name}`);
}

/** Checks of every `put`, shared by all adapters: key, image content type, size limit. */
export function putKey(
  accountId: string,
  name: string,
  bytes: Uint8Array,
  contentType: string,
): Result<string> {
  const key = objectKey(accountId, name);
  if (!key.ok) return key;
  if (contentType !== MEDIA_LIMITS.storedType) return failed(appError("media.type_unsupported"));
  if (bytes.byteLength > MEDIA_LIMITS.storedMaxBytes) return failed(appError("media.too_large"));
  return key;
}
