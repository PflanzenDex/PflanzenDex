import type { ApiError } from "../../light-api/light-api";
import { refusalText } from "@/shared/lib/error-text";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { fieldNames, userText } from "../../texts";

/**
 * Server error with what to do next (P-09); for a used zone with all users (P-10). Text by error code (DS-49). A refusal is
 * the one error tone: red border and error mark (SG-COLOR-04, SG-STATE-03).
 */
export function ErrorMessage({ error }: { error: ApiError }) {
  const fields = fieldNames(error);
  return (
    <Banner variant="error" className="mt-3 break-words">
      <div className="flex min-w-0 flex-col gap-1">
        <p>{refusalText(error)}</p>
        {fields.length > 0 && <p>Prüfe: {fields.join(", ")}.</p>}
        {error.data && error.data.length > 0 && (
          <ul className="list-disc pl-5">
            {error.data.map((n) => (
              <li key={`${n.kind}-${n.id}`}>{userText(n)}</li>
            ))}
          </ul>
        )}
      </div>
    </Banner>
  );
}
