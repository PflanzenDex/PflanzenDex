import { cn } from "@/shared/lib/utils";

/**
 * The drawn placeholder of a missing or failed photo (SG-PHOTO-02, US-QS-32): the sprout of the app's motif
 * (`styles/pwa/motifs/sprout.svg`) inlined as a React SVG, drawn in the text colour on the muted surface. Both are theme
 * tokens, so it holds in light and dark, and in forced colors the drawing takes the system text colour. It is decorative
 * (the name of the object is the label), and it fills its box, which the caller sizes (the 56 px thumbnail).
 */
export function ObjectPlaceholder({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-full items-center justify-center bg-muted text-muted-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 512 512" focusable="false" className="size-8 fill-current">
        <rect x="132" y="392" width="248" height="24" rx="12" />
        <rect x="248" y="262" width="16" height="136" rx="8" />
        <path
          transform="translate(248 268) rotate(-50) scale(1.1)"
          d="M0 0C46 -40 46 -110 0 -150C-46 -110 -46 -40 0 0Z"
        />
        <path
          transform="translate(264 262) rotate(38) scale(0.8)"
          d="M0 0C46 -40 46 -110 0 -150C-46 -110 -46 -40 0 0Z"
        />
      </svg>
    </span>
  );
}
