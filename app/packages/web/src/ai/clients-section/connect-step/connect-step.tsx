import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";

/** The layer of how to connect a client (`?sheet=howto`, US-KI-07); the empty sheets lead to it (issue 2022). */
export const HOWTO_LAYER = "howto";
/** The layer of a new task (`?sheet=new-task`, US-KI-08); the empty sheets lead to it (issue 2022). */
export const NEW_TASK_LAYER = "new-task";

/**
 * A button that opens the sibling layer `layer` (issue 2022, FX-81): the next step of an empty sheet. Opening another
 * layer replaces the one the button sits in (US-QS-15); the button is the opener, so the focus can return to it.
 */
export function StepButton({
  layer,
  label,
  variant = "tinted",
  className,
}: {
  layer: string;
  label: string;
  variant?: "tinted" | "secondary";
  className?: string;
}) {
  const { openLayer } = useLayer(layer);
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      aria-haspopup="dialog"
      className={className}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      {label}
    </Button>
  );
}

/**
 * An empty sheet (SG-STATE-01, FX-81): one line that says what is missing and one action that opens the layer `layer`.
 * The action gets the press from `EmptyState`, which passes the click on, so the button is the opener.
 */
export function EmptySheet({
  title,
  description,
  layer,
  label,
}: {
  /** A title has no full stop and holds one sentence (SG-COPY-01). */
  title: string;
  description?: string;
  layer: string;
  label: string;
}) {
  const { openLayer } = useLayer(layer);
  return (
    <EmptyState
      compact
      level={3}
      title={title}
      {...(description ? { description } : {})}
      action={{
        label,
        onClick: (event?: { currentTarget: HTMLElement | null }) =>
          openLayer(event?.currentTarget ?? null),
      }}
    />
  );
}
