// The cleaned photo of a measurement for the AI client (US-KI-04): own account only, read right, logged. The client
// may suggest a quality and a note as a draft (`photo_assessment`); the code writes only after the keeper adopts it.
import { appError, failed, type Result } from "../kernel";
import { mayCall, type AiRights } from "./rights";
import type { AiLogStore } from "./status";

export type PhotoFile = { readonly bytes: Uint8Array; readonly contentType: string };

/** The photo of a measurement of the account (the care module behind a port, so `ai` does not import it). */
export type PhotoSource = (userId: string, measurementId: string) => Promise<Result<PhotoFile>>;

export interface PhotoCall {
  readonly userId: string;
  readonly connectionId: string;
  readonly rights: AiRights;
  readonly measurementId: string;
  readonly now: Date;
}

/**
 * Hands the photo of one measurement to the connected client. A foreign or unknown measurement and a measurement without
 * a photo answer like the form's photo route (P-04); the call is logged without content (P-10).
 */
export async function aiMeasurementPhoto(
  deps: { readonly photo: PhotoSource; readonly log: AiLogStore },
  call: PhotoCall,
): Promise<Result<PhotoFile>> {
  if (!mayCall(call.rights, "measurement_photo")) return failed(appError("ai.scope_insufficient"));
  const r = await deps.photo(call.userId, call.measurementId);
  if (!r.ok) return r;
  await deps.log.record(
    call.userId,
    { connectionId: call.connectionId, operation: "measurement_photo", effect: "read: one photo" },
    call.now,
  );
  return r;
}
