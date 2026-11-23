import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { errorText } from "@/shared/lib/error-text";

/** The refusal of a write, in the layer it happened in (P-10); a success is never boxed (F-0160). */
export function LampOutcome(props: {
  error: { code: string; dismiss?: (() => void) | undefined } | null;
}) {
  return props.error ? (
    <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
      {errorText(props.error.code)}
      <RefusalClose error={props.error} />
    </p>
  ) : null;
}
