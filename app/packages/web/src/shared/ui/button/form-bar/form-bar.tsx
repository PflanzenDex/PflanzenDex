import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/shared/ui/button/button";
import { NetworkSlot } from "@/shared/ui/button/network-gate/network-gate";
import { BUSY_LOOK, cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { useFormBarHost } from "./form-bar.host";
import { usePageBar } from "./form-bar.page";
import table from "./form-bar.de.json";

const t = texts(table);

export type FormBarProps = {
  /** The id of the form the confirming action submits (`form` attribute): the form may sit elsewhere in the DOM. */
  formId?: string;
  /** For a layer without a `<form>`: the press of the confirming action (a button, not a submit). */
  onConfirm?: () => void;
  /** The label of the confirming action: "Sichern" for a save, "Anlegen", "Weiter" where the form says so. */
  children: React.ReactNode;
  /** The action deletes (SG-BTN-03): the red filled look; without it the action is the one filled `default` button. */
  destructive?: boolean;
  /** The accessible name of the confirming action when it must name its object ("Sichern: Echte Aloe"). */
  confirmName?: string;
  /** Not usable now: the browser disables the button. */
  disabled?: boolean;
  /** Not usable now, but it keeps the focus (`aria-disabled`, PF-045): the form's own submit guard does the refusing. */
  inactive?: boolean;
  /** The write runs: the pending text shows, the button is disabled and cannot be pressed twice. */
  pending?: boolean;
  /** The text while `pending`; the German "Sichert …" by default. */
  pendingText?: string;
  /** `aria-busy` without disabling (a button that stays `inactive` while its write runs). */
  busy?: boolean;
  /** The action writes at once and cannot wait for the network (US-QS-30). */
  needsNetwork?: boolean;
  /**
   * The way out of a page form: the same as Back. Inside a sheet, dialog or pane the container's close is used, so the
   * layer's guard still asks for typed input ("Eingabe verwerfen?"). Without either, no "Abbrechen" is drawn.
   */
  onCancel?: () => void;
  /** Extra classes of the bar drawn in place (a dialog, a pane or a page), e.g. to span the columns of a grid form. */
  className?: string;
};

/**
 * The bar row: "Abbrechen" at the leading edge, the confirming action at the trailing edge (SG-SHEET-04). It wraps, so at
 * 200 % text the action goes below "Abbrechen" instead of squeezing it. Both buttons keep a 44 px hit area; the 8 px gap
 * between them follows SG-TOUCH-01.
 */
const ROW = "flex flex-wrap items-center justify-between gap-x-2 gap-y-1";

/** The two buttons. `data-close` marks "Abbrechen" as chrome, so a layer's focus rules never take it for its first control. */
function Pair(props: FormBarProps & { cancel: (() => void) | undefined }) {
  const { children, cancel, pending = false } = props;
  const pendingText = props.pendingText ?? t("pending");
  const confirm = {
    ...(props.formId !== undefined ? { type: "submit" as const, form: props.formId } : {}),
    ...(props.formId === undefined ? { type: "button" as const, onClick: props.onConfirm } : {}),
  };
  const inactive = props.inactive === true;
  return (
    <>
      {cancel ? (
        <Button type="button" variant="plain" data-close onClick={cancel}>
          {t("cancel")}
        </Button>
      ) : null}
      <NetworkSlot visible={false}>
        <Button
          {...confirm}
          variant={props.destructive ? "destructive" : "default"}
          disabled={props.disabled || pending}
          {...(props.confirmName !== undefined ? { "aria-label": props.confirmName } : {})}
          {...(inactive ? { "aria-disabled": true } : {})}
          {...(pending || props.busy ? { "aria-busy": true } : {})}
          {...(props.needsNetwork ? { needsNetwork: true } : {})}
          className={cn("ml-auto h-auto max-w-full whitespace-normal", BUSY_LOOK)}
        >
          {pending ? pendingText : children}
        </Button>
      </NetworkSlot>
    </>
  );
}

/** A phone sheet: the pair goes into the sheet's bar; the sheet drops its X while a form has one (one close control). */
function SheetBar(props: FormBarProps & { slot: HTMLElement | null; close: () => void }) {
  const host = useFormBarHost();
  const register = host?.register;
  const attached = props.slot !== null;
  React.useLayoutEffect(() => (attached ? register?.() : undefined), [attached, register]);
  if (!props.slot) return null;
  return createPortal(
    <div data-form-bar="" className={ROW}>
      <Pair {...props} cancel={props.onCancel ?? props.close} />
    </div>,
    props.slot,
  );
}

/** A dialog or pane: a plain row in the content, nothing sticky. */
function RowBar(props: FormBarProps & { close: () => void }) {
  return (
    <div data-form-bar="" className={cn(ROW, "min-w-0", props.className)}>
      <Pair {...props} cancel={props.onCancel ?? props.close} />
    </div>
  );
}

/**
 * A page: the bar sticks at the top of the form, below the app's top bar, and follows the visual viewport, so with the
 * keyboard open it stays above the keyboard and covers no field (SG-FORM-02, `usePageBar`). It is the first child of the
 * form region, because a sticky element only sticks within its parent. The solid fill hides the fields that scroll under it.
 */
function PageBar(props: FormBarProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  usePageBar(ref);
  return (
    <div
      ref={ref}
      data-form-bar=""
      className={cn(
        ROW,
        "sticky z-30 min-w-0 border-b border-border bg-background py-2",
        props.className,
      )}
    >
      <Pair {...props} cancel={props.onCancel} />
    </div>
  );
}

/**
 * The actions of a form (US-QS-32, SG-SHEET-04): "Abbrechen" at the leading edge, the confirming action at the trailing
 * edge, the one filled button of the view (SG-BTN-02). There is no sticky footer. The container decides where the pair
 * is drawn: in the bar of a phone sheet, in a row of a dialog or pane, at the top of a page form (sticky). The confirming
 * button names its form with `form`, so it submits it from wherever it is drawn. Render it first in the form region.
 */
export function FormBar(props: FormBarProps) {
  const host = useFormBarHost();
  if (host?.sheet) return <SheetBar {...props} slot={host.slot} close={host.close} />;
  if (host) return <RowBar {...props} close={host.close} />;
  return <PageBar {...props} />;
}
