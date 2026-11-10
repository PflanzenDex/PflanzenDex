import { refusalText } from "@/shared/lib/error-text";
import type { Notice, Scope } from "../operator-actions";

/** The outcome of the last write, when it belongs to this layer. */
export function LayerNotice({ notice, scope }: { notice: Notice | null; scope: Scope }) {
  if (notice?.scope !== scope) return null;
  return (
    <>
      {notice.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {notice.message}
        </p>
      )}
      {notice.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {refusalText(notice.error)}
        </p>
      )}
    </>
  );
}
