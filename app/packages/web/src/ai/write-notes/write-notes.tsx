import { RefusalClose } from "@/shared/patterns/states/banner/banner";

/**
 * What the last write of a section of "KI" did (P-10): the refusal of the API, which stays until the keeper acts and has the
 * one control of a key conflict, "Hinweis schließen" (US-QS-03), and the status line of what changed.
 */
export function WriteNotes(props: {
  error: { text: string; dismiss?: (() => void) | undefined } | null;
  status: string | null;
}) {
  return (
    <>
      {props.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3">
          {props.error.text}
          <RefusalClose error={props.error} />
        </p>
      )}
      {props.status && (
        <p role="status" className="rounded-lg border border-border p-3">
          {props.status}
        </p>
      )}
    </>
  );
}
