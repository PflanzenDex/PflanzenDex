import { cva } from "class-variance-authority";
import { Search, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/shared/ui/button";
import { cn, mergeRefs } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { Input, type InputProps } from "./input";
import table from "./search-input.de.json";

const ui = texts(table);

/**
 * The room at the end of the field: the clear button or the key hint sits there only while it shows, so an empty field gives
 * its placeholder the width (DS-34: the variant is chosen by cva, not by a class string; SG-SEARCH-01, 200 % text).
 */
const endRoom = cva("", {
  variants: { room: { none: "", hint: "md:pr-11", end: "pr-11" } },
  defaultVariants: { room: "none" },
});

export type SearchInputProps = Omit<InputProps, "type" | "value" | "defaultValue"> & {
  /** The text in the field; the field is controlled (also with react-hook-form: pass `field.value`). */
  value: string;
  /** Called by the clear button. Set the value to "" here; the field takes the focus back by itself. */
  onClear: () => void;
  /** The keyboard shortcut that focuses this field (US-QS-11): shown on desktop while the field is empty, and announced. */
  keyHint?: { visible: string; aria: string } | undefined;
};

/**
 * The one search field (US-QS-24, US-ONB-01, issue 1094): an `Input` of type search without the browser's own clear
 * icon, which is blue, has no German name and is too small to hit. Instead, while the field holds text, a ghost icon
 * button "Suche leeren" (44 x 44 px) sits inside it. It clears the text and puts the focus back into the field.
 * The lucide search icon sits at the left inside the field (SG-SEARCH-01, US-QS-32); the text starts after it.
 * `className` styles the wrapper, so a caller can size the field in its row.
 */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onClear, disabled, keyHint, ...props }, ref) => {
    const inner = React.useRef<HTMLInputElement | null>(null);
    // One stable callback for both refs: the clear button needs the element, the caller keeps its ref.
    const setRef = React.useMemo(() => mergeRefs(inner, ref), [ref]);
    // The end of the field is reserved while the clear button or the key hint is there.
    // The key hint shows only from md (768 px), so below it an empty field keeps the full width for the placeholder.
    const room = disabled ? "none" : value !== "" ? "end" : keyHint ? "hint" : "none";
    return (
      <div className={cn("relative", className)}>
        {/* Decorative: the field's accessible name is the label (SG-ICON-02). 20 px in a field (SG-ICON-01). */}
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          {...props}
          ref={setRef}
          type="search"
          value={value}
          disabled={disabled}
          aria-keyshortcuts={keyHint?.aria}
          // Room for the icon at the start, so the text never runs under it. The end keeps its room for the clear button
          // only while the button shows (text in the field) or the key hint does: an empty field gives the placeholder
          // that width (SG-SEARCH-01, 200 % text). The native cancel icon is hidden (WebKit, Blink).
          className={cn(
            "ps-10 [&::-webkit-search-cancel-button]:appearance-none",
            endRoom({ room }),
          )}
        />
        {keyHint && value === "" && !disabled && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 hidden items-center font-mono text-sm text-muted-foreground md:flex"
          >
            {keyHint.visible}
          </kbd>
        )}
        {value !== "" && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={ui("clear")}
            className="absolute inset-y-0 right-0"
            onClick={() => {
              onClear();
              inner.current?.focus();
            }}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
