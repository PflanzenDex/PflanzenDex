import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/shared/ui/button";
import { NetworkSlot } from "@/shared/ui/button.network-gate";
import { BUSY_LOOK, cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { useFormBarHost } from "./form-bar.host";
import { useFormBarRegion, usePageBar } from "./form-bar.page";
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
  /** Extra classes of the bar drawn in place (a page form), e.g. to span the columns of a grid form. */
  className?: string;
  /**
   * The status line of the action ("Foto wird gespeichert …", US-WAC-06): it stands right under the pair, wherever the bar is
   * drawn: inside the bar of a sheet, a dialog or a pane, under the sticky bar at the top of a page form, under the row from `md`. Given
   * (also as `null`), the line is always in the DOM, so a status that appears is announced, and empty it takes no room; left
   * out, there is none.
   */
  status?: string | null;
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

/** The status line of an action: a polite live region that is there before its text, and takes no room while empty. */
function Status(props: { text: string | null | undefined }) {
  if (props.text === undefined) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground empty:hidden">
      {props.text}
    </p>
  );
}

/**
 * The bar of a container: the pair goes through a portal into the container's `slot`, which is outside its scroll region. A
 * phone sheet has it above the title and drops its X while a form has one (one close control); a dialog and a pane have it
 * pinned at their bottom and keep their X (owner decisions d-060 and d-115). Nothing is drawn until the container has its slot.
 */
function HostBar(props: FormBarProps & { slot: HTMLElement | null; close: () => void }) {
  const host = useFormBarHost();
  const register = host?.register;
  const attached = props.slot !== null;
  React.useLayoutEffect(() => (attached ? register?.() : undefined), [attached, register]);
  // The status line goes into the bar with the pair, right under it, so it stays next to the button that was pressed.
  if (!props.slot) return null;
  return createPortal(
    <>
      <div data-form-bar="" className={ROW}>
        <Pair {...props} cancel={props.onCancel ?? props.close} />
      </div>
      <Status text={props.status} />
    </>,
    props.slot,
  );
}

/**
 * A plain row in the content, after the last field, nothing sticky (owner decision d-060): the bar of a page form from `md`,
 * and of a form that no container and no region draws. The status line follows the row.
 */
function RowBar(props: FormBarProps & { cancel: (() => void) | undefined }) {
  return (
    <>
      <div data-form-bar="" className={cn(ROW, "min-w-0", props.className)}>
        <Pair {...props} />
      </div>
      <Status text={props.status} />
    </>
  );
}

/**
 * A page form below `md`: the bar sticks at the top of the form, below the app's top bar, and follows the visual viewport, so
 * with the keyboard open it stays above the keyboard and covers no field (SG-FORM-02, `usePageBar`). It is drawn into the
 * slot at the top of the `FormBarRegion`, because a sticky element only sticks within its parent. The solid fill hides the
 * fields that scroll under it. The status line follows the bar into the slot, so it stays right under the bar where the keeper
 * pressed the action.
 */
function PageBar(props: FormBarProps & { slot: HTMLElement }) {
  const ref = React.useRef<HTMLDivElement>(null);
  usePageBar(ref);
  return createPortal(
    <>
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
      <Status text={props.status} />
    </>,
    props.slot,
  );
}

/**
 * The actions of a form (US-QS-32, SG-SHEET-04, owner decisions d-060 and d-115): "Abbrechen" at the leading edge, the
 * confirming action at the trailing edge, the one filled button of the view (SG-BTN-02). There is no sticky footer inside the
 * content. Render it last in the form region, after the last field: in a sheet, a dialog and a pane the container draws the pair
 * into its own bar outside the scroll region (the sheet above its title, the dialog and the pane pinned at their bottom), so
 * the confirming action is always in view; a page form (its content in a `FormBarRegion`) sticks it at the top of the form
 * below `md` and keeps a plain row after the last field from `md`. The confirming button names its form with `form`, so it
 * submits it from wherever it is drawn. Only one pair is in the page at a time.
 */
export function FormBar(props: FormBarProps) {
  const host = useFormBarHost();
  const region = useFormBarRegion();
  const isMd = useIsMd();
  if (host) return <HostBar {...props} slot={host.slot} close={host.close} />;
  if (region && !isMd) return region.slot ? <PageBar {...props} slot={region.slot} /> : null;
  return <RowBar {...props} cancel={props.onCancel} />;
}
