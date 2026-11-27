import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { useOnline } from "@/shared/platform/browser/network";
import table from "./button.de.json";

const t = texts(table);

/** The reason a control that writes at once gives while the device is offline (US-QS-30, SG-BTN-05). */
export const offlineReason = t("offline");

/** The look of the reason line: visible next to its group, or for assistive technology only (DS-34: variants by cva). */
const reasonLook = cva("", {
  variants: {
    visible: { true: "text-sm text-muted-foreground", false: "sr-only" },
  },
  defaultVariants: { visible: true },
});

/** The line that gives the reason: visible next to its group, or read by assistive technology only (`visible` false). */
export function NetworkReason(props: {
  id: string;
  visible?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      id={props.id}
      className={cn(reasonLook({ visible: props.visible !== false }), props.className)}
    >
      {offlineReason}
    </span>
  );
}

/** The id of the reason line of the enclosing `NetworkSlot`, `null` outside one. */
const SlotContext = React.createContext<string | null>(null);

/**
 * A group of controls that write at once (US-QS-30): the reason stands once below the group, never between its buttons,
 * and every control of the group names it. The line is only rendered while the device is offline.
 */
export function NetworkSlot(props: {
  children: React.ReactNode;
  /** `false`: the line is read by assistive technology only (a sticky bar without room); the visible reason is the frame's note. */
  visible?: boolean | undefined;
  className?: string | undefined;
}) {
  const id = React.useId();
  const online = useOnline();
  return (
    <SlotContext.Provider value={id}>
      {props.children}
      {online ? null : (
        <NetworkReason id={id} visible={props.visible} className={props.className} />
      )}
    </SlotContext.Provider>
  );
}

export type NetworkGate<E extends HTMLElement = HTMLElement> = {
  /** The device is offline and the control writes at once: the control is inactive. */
  offline: boolean;
  /** The control renders its own line (it stands alone, not in a `NetworkSlot`). */
  inline: boolean;
  /** The id of the own line, or of the slot's line when there is one. */
  reasonId: string;
  /** The `aria-describedby` of the control: the caller's ids first, then the reason. */
  describedBy: string | undefined;
  /** The press of the control: offline it does nothing, so neither its action nor a form submit runs. */
  press: React.MouseEventHandler<E> | undefined;
};

/**
 * The offline state of one control that writes at once (US-QS-30). Only the controls that set `needsNetwork` call it, so
 * a plain control subscribes to nothing. Offline the control stays focusable and keeps the keeper's input.
 */
export function useNetworkGate<E extends HTMLElement>(
  describedBy: string | undefined,
  onClick: React.MouseEventHandler<E> | undefined,
): NetworkGate<E> {
  const online = useOnline();
  const slot = React.useContext(SlotContext);
  const ownId = React.useId();
  const offline = !online;
  const reasonId = slot ?? ownId;
  return {
    offline,
    inline: offline && slot === null,
    reasonId: ownId,
    describedBy:
      [describedBy, offline ? reasonId : undefined].filter(Boolean).join(" ") || undefined,
    press: offline ? (event: React.MouseEvent<E>) => event.preventDefault() : onClick,
  };
}
