import type { ComponentProps } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

/**
 * A set of related controls (checkboxes, radios, the two ends of a range) as one named group (US-QS-09, WCAG 1.3.1 and
 * 4.1.2). It is the native `<fieldset>`: the screen reader reads the name of the group before each control in it. The
 * name comes from the `FieldLegend` inside; a group without one has no name. `min-w-0` lets the set shrink inside a flex
 * column (a fieldset is as wide as its content by default). Taken from the upstream `FieldSet` of shadcn/ui, adapted
 * (section 1.4 of the design system): the rules for the groups of the upstream checkbox and radio family are left out.
 */
export function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("flex min-w-0 flex-col gap-4", className)}
      {...props}
    />
  );
}

/**
 * `legend` is the size of a group heading (16 px), `label` the size of a field label (14 px); `srOnly` keeps the name for the
 * screen reader and drops every look. Plain size classes, so a caller's `text-*` or `font-*` wins (DS-31).
 */
const legendVariants = cva("", {
  variants: {
    variant: { legend: "", label: "" },
    srOnly: { true: "sr-only", false: "" },
  },
  compoundVariants: [
    { variant: "legend", srOnly: false, className: "mb-1.5 text-base font-medium" },
    { variant: "label", srOnly: false, className: "mb-1.5 text-sm font-medium" },
  ],
  defaultVariants: { variant: "legend", srOnly: false },
});

type FieldLegendProps = ComponentProps<"legend"> & {
  /** `legend` is the size of a group heading (16 px), `label` the size of a field label (14 px). */
  variant?: "legend" | "label";
  /** The name stays for the screen reader and takes no place on the screen (the group is named by its context). */
  srOnly?: boolean;
};

/** The name of its `FieldSet` (the first child of the fieldset). Taken from the upstream `FieldLegend`, with `srOnly`. */
export function FieldLegend({
  className,
  variant = "legend",
  srOnly = false,
  ...props
}: FieldLegendProps) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(legendVariants({ variant, srOnly }), className)}
      {...props}
    />
  );
}
