import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/shared/lib/utils";
import type { FieldInvalidProps } from "./input";

export type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> & FieldInvalidProps;

/**
 * The switch of a setting that takes effect at once (US-QS-32, SG-CTRL-02): a button with `role="switch"` and `aria-checked`,
 * so a screen reader says "an" and "aus", and the thumb moves by position and by colour (not by colour alone, WCAG 1.4.1).
 * It is adapted from shadcn/ui (Radix): the button is 52 × 44 px in px, so it keeps its size at a large text size and is the
 * 44 px target itself (SG-TOUCH-01, the conformance probe measures the button); the 52 × 32 px track is drawn inside it. The
 * caller names it, normally through `SwitchRow`. A switch that writes
 * is controlled (`checked` and `onCheckedChange`) and is `aria-disabled` while it saves, never `disabled`, because a focused
 * control that becomes disabled loses the focus (US-QS-32, issue 2317); the caller then ignores the change.
 */
function Switch({ className, invalid, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(
        // The button is the 44 px target (DS-15, SG-TOUCH-01): 52 x 44 px, with the 52 x 32 px track drawn inside it.
        "group/switch peer relative inline-flex h-11 w-[52px] shrink-0 items-center rounded-full " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
          "aria-invalid:outline aria-invalid:outline-2 aria-invalid:outline-destructive " +
          "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span
        data-slot="switch-track"
        className={
          "pointer-events-none flex h-8 w-full items-center rounded-full " +
          "transition-colors duration-(--motion-fast) ease-(--ease-enter) motion-reduce:transition-none " +
          "group-data-[state=checked]/switch:bg-primary group-data-[state=unchecked]/switch:bg-input " +
          // Forced colors drop the fills: the track keeps a boundary and a checked track is the highlight (WCAG 1.4.11).
          "forced-colors:border-2 forced-colors:border-[ButtonText] forced-colors:group-data-[state=checked]/switch:bg-[Highlight]"
        }
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={
            "pointer-events-none block size-[24px] rounded-full bg-background " +
            "transition-transform duration-(--motion-fast) ease-(--ease-enter) motion-reduce:transition-none " +
            "data-[state=unchecked]:translate-x-1 data-[state=checked]:translate-x-[24px] " +
            "dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground " +
            "forced-colors:bg-[ButtonText]"
          }
        />
      </span>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
