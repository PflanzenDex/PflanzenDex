import { errorText } from "@/shared/lib/error-text";
import type { ApiError } from "../../shared/data";

/**
 * The German text of a refusal (DS-49, P-10): by its error code, never the raw server text. The one code the web
 * app makes up itself (the server did not answer) carries its own German text.
 */
export function refusalText(error: ApiError): string {
  return error.code === "network.not_reachable" ? error.text : errorText(error.code);
}
