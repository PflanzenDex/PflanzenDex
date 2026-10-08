import { cva } from "class-variance-authority";
import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";

/**
 * Card surface (US-QS-07, DS-34, DS-35): Greenhouse card radius and elevation 1. The interactive variants lift to
 * elevation 2 on hover (shadow only, no movement) and carry the shared focus ring and a 44 px target (DS-15).
 */
const cardVariants = cva(
  "block min-w-0 break-words rounded-card border border-transparent forced-colors:border-[CanvasText]",
  {
    variants: {
      interactive: {
        true:
          "min-h-[44px] w-full text-left transition-shadow duration-(--motion-fast) ease-(--ease-enter) hover:shadow-elevation-2 motion-reduce:transition-none " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        false: "",
      },
      // A card inside the page card: flat, one step tinted (ADR 0011 decision 4, depth from the surface step), no
      // second shadow and no second border line.
      nested: {
        true: "bg-secondary text-secondary-foreground shadow-none",
        false: "bg-card text-card-foreground shadow-elevation-1",
      },
    },
    defaultVariants: { interactive: false, nested: false },
  },
);

type CardOwnProps = {
  /** Picture or other leading content, flush with the card edge. Decorative media carries `alt=""` itself. */
  media?: React.ReactNode;
  /** Trailing row below the body, separated by a rule (dates, badges, secondary actions of a static card). */
  footer?: React.ReactNode;
  /** Classes for the padded body block; only used when `media` or `footer` is present (see the layout contract). */
  bodyClassName?: string | undefined;
  /** The card sits inside another card (the page card): flat and tinted instead of raised (US-QS-14). */
  nested?: boolean;
};

/**
 * `href` makes the whole card one `<a>`, `onClick` one `<button>`; nothing interactive may sit inside it. A card with
 * neither is a plain container whose footer may hold its own controls. With both, the link wins.
 */
export type CardProps = CardOwnProps &
  Omit<React.HTMLAttributes<HTMLElement>, "onClick"> &
  Pick<React.AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel" | "download"> & {
    href?: string;
    onClick?: React.MouseEventHandler<HTMLElement>;
  };

// Layout contract (US-QS-14): without media and footer the children are direct children of the card element, which
// carries the padding itself, so `className="grid gap-1"` on the card lays the children out. With media or footer the
// children sit in a padded body block that takes `bodyClassName`.
function Slots(props: CardOwnProps & { children: React.ReactNode }) {
  return (
    <>
      {props.media ? (
        <span className="block overflow-hidden rounded-t-card">{props.media}</span>
      ) : null}
      <span className={cn("block p-4", props.bodyClassName)}>{props.children}</span>
      {props.footer ? (
        <span className="block border-t border-border px-4 py-3">{props.footer}</span>
      ) : null}
    </>
  );
}

const Card = React.forwardRef<HTMLElement, CardProps>((props, ref) => {
  const { media, footer, bodyClassName, nested, className, children, ...rest } = props;
  const slotted = Boolean(media) || Boolean(footer);
  const pad = slotted ? "" : "p-4";
  const slots = slotted ? (
    <Slots media={media} footer={footer} bodyClassName={bodyClassName}>
      {children}
    </Slots>
  ) : (
    children
  );
  if (typeof props.href === "string") {
    const { href, onClick, ...anchor } = rest;
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        {...(onClick ? { onClick: onClick as React.MouseEventHandler<HTMLAnchorElement> } : {})}
        className={cn(cardVariants({ interactive: true, nested }), pad, className)}
        {...anchor}
      >
        {slots}
      </a>
    );
  }
  if (typeof props.onClick === "function") {
    return (
      <Button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        variant="ghost"
        className={cn(
          cardVariants({ interactive: true, nested }),
          "h-auto items-stretch justify-start whitespace-normal rounded-[var(--radius-card)] p-0 text-left text-base font-normal hover:bg-card hover:text-card-foreground",
          pad,
          className,
        )}
        {...(rest as Omit<ButtonProps, "size" | "variant" | "className" | "children">)}
      >
        {slots}
      </Button>
    );
  }
  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(cardVariants({ nested }), pad, className)}
      {...(rest as React.HTMLAttributes<HTMLDivElement>)}
    >
      {slots}
    </div>
  );
});
Card.displayName = "Card";

export { Card, cardVariants };
