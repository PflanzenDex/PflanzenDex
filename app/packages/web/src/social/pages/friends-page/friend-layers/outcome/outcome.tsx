import { errorText } from "@/lib/error-text";
import { SIGN_IN, type ApiError } from "../../../../../kernel";

/** What the last write did: a notice, or the German text of its refusal (P-10). */
export function Outcome(props: { message: string | null; error: ApiError | null }) {
  const { message, error } = props;
  return (
    <>
      {message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {error.code === SIGN_IN.code ? SIGN_IN.text : errorText(error.code)}
        </p>
      )}
    </>
  );
}
