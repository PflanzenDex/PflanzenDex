import type { EquipmentSharingRow } from "@pflanzendex/core";
import { call, type Response, type WriteOptions, writeFor } from "../../../../shared/data";

export type { EquipmentSharingRow };

/** The own sharing settings (US-EQU-12); all equipment not listed is private (P-05). */
export function loadEquipmentSharing(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<{ shared: readonly EquipmentSharingRow[] }>> {
  return call(fetchFn, `${api}/equipment/sharing`, token);
}

/** Shares a piece of equipment with friends (with an optional note) or withdraws it (US-EQU-12). */
export async function setEquipmentSharing(
  api: string,
  token: string,
  target: { id: string; share: "private" | "friends"; note: string | null },
  options: WriteOptions = {},
): Promise<Response<unknown>> {
  return writeFor(api, token, options)(
    "PUT",
    `/equipment/${encodeURIComponent(target.id)}/sharing`,
    {
      share: target.share,
      ...(target.share === "friends" ? { note: target.note } : {}),
    },
  );
}
