import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Avatar sizes (US-QS-07, DS-34). Not interactive; wrap it in a control where it should be one. */
const avatarVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-pill bg-secondary font-semibold text-secondary-foreground forced-colors:border forced-colors:border-[CanvasText]",
  {
    variants: {
      size: { sm: "size-8 text-label", md: "size-10 text-sm", lg: "size-14 text-lg" },
    },
    defaultVariants: { size: "md" },
  },
);

/** First letters of the first and last word, upper case; "" for a blank name (never an invented value, P-08). */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return [first, last]
    .map((w) => (w ? (Array.from(w)[0] ?? "") : ""))
    .join("")
    .toLocaleUpperCase("de-DE");
}

export type AvatarProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> &
  VariantProps<typeof avatarVariants> & {
    /** Name of the person or plant: the accessible name and the source of the initials. */
    name: string;
    /** Image URL; when it is missing or fails to load, the initials stand in. */
    src?: string | null;
    /** Draw only: hidden from assistive technology, for places where the name is next to it as text. */
    decorative?: boolean;
  };

/**
 * Round image with an initials fallback (US-QS-07, 1.1.1). The image has the name as alternative text; the fallback
 * is an `img` role with the same name, so both read alike. `decorative` hides it when the name is already visible.
 */
const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, name, src, decorative = false, ...props }, ref) => {
    const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
    const showImage = typeof src === "string" && src !== "" && src !== failedSrc;
    const initials = initialsOf(name) || "?";
    const a11y = decorative
      ? { "aria-hidden": true }
      : showImage
        ? {}
        : { role: "img", "aria-label": name };
    return (
      <span ref={ref} className={cn(avatarVariants({ size }), className)} {...a11y} {...props}>
        {showImage ? (
          <img
            src={src}
            alt={decorative ? "" : name}
            loading="lazy"
            className="size-full object-cover"
            onError={() => setFailedSrc(src)}
          />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </span>
    );
  },
);
Avatar.displayName = "Avatar";

export { Avatar, avatarVariants };
