import type { ApiError } from "./api";

/** Load error of a page: the text for the error code and the action "Reload" (P-09, P-10). */
export function LoadError(props: { error: ApiError; onReload: () => void }) {
  return (
    <div role="alert" className="warning">
      <p>{props.error.text}</p>
      <div className="actions">
        <button type="button" className="secondary" onClick={props.onReload}>
          Erneut laden
        </button>
      </div>
    </div>
  );
}
