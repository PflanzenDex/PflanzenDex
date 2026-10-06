import type { ApiError } from "./light-api";
import { fieldNames, refusalText, userText } from "./texts";

/** Server error with what to do next (P-09); for a used zone with all users (P-10). Text by error code (DS-49). */
export function ErrorMessage({ error }: { error: ApiError }) {
  const fields = fieldNames(error);
  return (
    <div
      role="alert"
      className="mt-3 flex min-w-0 flex-col gap-1 break-words rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
    >
      <p>{refusalText(error)}</p>
      {fields.length > 0 && <p>Bitte prüfe: {fields.join(", ")}.</p>}
      {error.data && error.data.length > 0 && (
        <ul className="list-disc pl-5">
          {error.data.map((n) => (
            <li key={`${n.kind}-${n.id}`}>{userText(n)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
