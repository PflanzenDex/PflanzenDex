import { X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "../input";

export type SearchInputProps = Omit<InputProps, "type" | "value" | "defaultValue"> & {
  /** The text in the field; the field is controlled (also with react-hook-form: pass `field.value`). */
  value: string;
  /** Called by the clear button. Set the value to "" here; the field takes the focus back by itself. */
  onClear: () => void;
};

/**
 * The one search field (US-QS-24, US-ONB-01, issue 1094): an `Input` of type search without the browser's own clear
 * icon, which is blue, has no German name and is too small to hit. Instead, while the field holds text, a ghost icon
 * button "Suche leeren" (44 x 44 px) sits inside it. It clears the text and puts the focus back into the field.
 * `className` styles the wrapper, so a caller can size the field in its row.
 */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onClear, disabled, ...props }, ref) => {
    const inner = React.useRef<HTMLInputElement | null>(null);
    return (
      <div className={cn("relative", className)}>
        <Input
          {...props}
          ref={(el) => {
            inner.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
          }}
          type="search"
          value={value}
          disabled={disabled}
          // Room for the button, so the text never runs under it; the native cancel icon is hidden (WebKit, Blink).
          className="pr-11 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value !== "" && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Suche leeren"
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
