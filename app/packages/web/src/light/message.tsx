import type { ApiError } from "./light-api";
import { fieldNames, userText } from "./text";

/** Server error with what to do next (P-09); for a used zone with all users (P-10). */
export function ErrorMessage({ error }: { error: ApiError }) {
  const fields = fieldNames(error);
  return (
    <div role="alert" className="warning">
      <p>{error.text}</p>
      {fields.length > 0 && <p>Bitte prüfe: {fields.join(", ")}.</p>}
      {error.data && error.data.length > 0 && (
        <ul className="user">
          {error.data.map((n) => (
            <li key={`${n.kind}-${n.id}`}>{userText(n)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
