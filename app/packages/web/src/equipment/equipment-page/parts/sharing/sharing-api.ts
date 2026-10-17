import type { EquipmentSharingRow } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../../../../kernel";

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
  fetchFn: typeof fetch = fetch,
): Promise<Response<unknown>> {
  return createWrite(api, token, fetchFn)(
    "PUT",
    `/equipment/${encodeURIComponent(target.id)}/sharing`,
    {
      share: target.share,
      ...(target.share === "friends" ? { note: target.note } : {}),
    },
  );
}
