import { ChevronDown } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CollapsibleProps = {
  /** Visible heading text; it is the button's name. */
  title: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Heading level of the title (the button sits inside it), so the outline of the page stays right. */
  headingLevel?: 2 | 3 | 4;
  children: React.ReactNode;
  className?: string;
};

/**
 * Collapsible section (US-QS-07, DS-34): a heading holding a button with `aria-expanded` and a region it controls.
 * The height animates with the motion tokens (grid rows 0fr to 1fr), which are 0 ms under reduced motion, so the
 * section then just switches. Closed content is `visibility: hidden` once the animation ends, so it leaves the tab
 * order and the accessibility tree.
 */
export function Collapsible(props: CollapsibleProps) {
  const base = React.useId();
  const [inner, setInner] = React.useState(props.defaultOpen ?? false);
  const open = props.open ?? inner;
  const Heading = `h${props.headingLevel ?? 3}` as "h3";
  const toggle = () => {
    setInner(!open);
    props.onOpenChange?.(!open);
  };
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-card text-card-foreground",
        props.className,
      )}
    >
      <Heading className="m-0">
        <Button
          id={`${base}-button`}
          type="button"
          variant="ghost"
          aria-expanded={open}
          aria-controls={`${base}-region`}
          onClick={toggle}
          className="h-auto w-full justify-between rounded-card px-4 py-3 text-left text-base"
        >
          {props.title}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-5 shrink-0 transition-transform duration-(--motion-base) ease-(--ease-enter) motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </Button>
      </Heading>
      <div
        id={`${base}-region`}
        role="region"
        aria-labelledby={`${base}-button`}
        data-state={open ? "open" : "closed"}
        className={cn(
          "grid transition-[grid-template-rows,visibility] duration-(--motion-base) ease-(--ease-enter) motion-reduce:transition-none",
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-4">{props.children}</div>
        </div>
      </div>
    </div>
  );
}

export type AccordionItem = { value: string; title: string; content: React.ReactNode };

export type AccordionProps = {
  items: readonly AccordionItem[];
  /** Values open at the start. Sections open and close independently, so several may be open (care profile sections). */
  defaultOpen?: readonly string[];
  headingLevel?: CollapsibleProps["headingLevel"];
  className?: string;
};

/** A stack of independent Collapsibles; each keeps its own state, so there is no hidden "only one open" rule. */
export function Accordion(props: AccordionProps) {
  return (
    <div className={cn("grid gap-2", props.className)}>
      {props.items.map((item) => (
        <Collapsible
          key={item.value}
          title={item.title}
          defaultOpen={props.defaultOpen?.includes(item.value) ?? false}
          {...(props.headingLevel ? { headingLevel: props.headingLevel } : {})}
        >
          {item.content}
        </Collapsible>
      ))}
    </div>
  );
}
