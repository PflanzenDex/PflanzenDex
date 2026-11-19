import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Menu } from "@/shared/patterns/display/panels/menu/menu";
import { Button } from "@/shared/ui/button/button";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import type { ApiError } from "../../../../shared/data";
import table from "../../../social.de.json";

const tx = texts(table);

/** The layer with the question that ends a friendship (US-SOZ-03); the friend's collection page opens it from its menu. */
const END_LAYER = "end-friendship";

/**
 * "Mehr" in the top bar of a friend's collection (US-QS-32): the rarer actions of a friend, here the end of the friendship
 * as a red action. Choosing it opens the question, which asks first (P-10); the menu itself ends nothing.
 */
export function FriendEndMenu(props: { disabled: boolean }) {
  const layer = useLayer(END_LAYER);
  return (
    <Menu
      label={tx("friendPage.more")}
      items={[
        {
          label: tx("friendEnd.title"),
          destructive: true,
          disabled: props.disabled,
          onSelect: () => layer.openLayer(),
        },
      ]}
    />
  );
}

/**
 * The question before a friendship ends (US-SOZ-03): what it does and what stays, then "Ja, beenden" or "Abbrechen". A
 * refusal stays on screen beside the question (P-10).
 */
function EndConfirm(props: {
  name: string;
  busy: boolean;
  error: ApiError | null;
  onYes: () => void;
}) {
  const { closeLayer } = useLayer(END_LAYER);
  return (
    <div
      role="group"
      aria-label={tx("friendEnd.group", { name: props.name })}
      className="flex flex-col gap-3"
    >
      <p>{tx("friendEnd.question", { name: props.name })}</p>
      <span className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="touch"
          variant="destructive"
          disabled={props.busy}
          onClick={props.onYes}
        >
          {tx("friendEnd.yes")}
        </Button>
        <Button type="button" size="touch" variant="outline" onClick={() => closeLayer()}>
          {tx("friendEnd.no")}
        </Button>
      </span>
      {props.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {errorText(props.error.code)}
        </p>
      )}
    </div>
  );
}

/** The layer of the question, mounted with the friend's data (its name is in the question). */
export function FriendEndLayer(props: {
  name: string;
  busy: boolean;
  error: ApiError | null;
  onYes: () => void;
}) {
  return (
    <LayerSheet id={END_LAYER} title={tx("friendEnd.title")}>
      <EndConfirm {...props} />
    </LayerSheet>
  );
}
