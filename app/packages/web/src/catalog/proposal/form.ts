import type { Species } from "@pflanzendex/core";
import type { ApiError } from "../../kernel";

/** For `species.duplicate` the server also supplies the existing species. */
export function duplicate(error: ApiError): Species | null {
  if (error.code !== "species.duplicate") return null;
  const data = error.data as unknown as { existing?: Species } | undefined;
  return data?.existing ?? null;
}
