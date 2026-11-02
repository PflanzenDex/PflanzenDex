import * as React from "react";
import { cn } from "@/lib/utils";
import type { InputProps } from "../../input";

/**
 * The one file picker (US-QS-24): a German button instead of the browser's "Choose File / No file chosen".
 * The native input stays in the page (visually hidden) so label, `id`, `accept`, `onChange` and keyboard work
 * as before. "Foto wählen" when it accepts images, else "Datei wählen".
 */
const FileField = React.forwardRef<HTMLInputElement, Omit<InputProps, "type" | "value">>(
  ({ className, onChange, accept, id, ...props }, ref) => {
    const [name, setName] = React.useState("");
    const inner = React.useRef<HTMLInputElement | null>(null);
    const photo = !accept || accept.includes("image");
    return (
      <div className={cn("flex min-h-[44px] items-center gap-3", className)}>
        <input
          {...props}
          id={id}
          ref={(el) => {
            inner.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
          }}
          type="file"
          accept={accept}
          className="peer sr-only"
          onChange={(e) => {
            setName(e.target.files?.[0]?.name ?? "");
            onChange?.(e);
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => inner.current?.click()}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-control border border-input bg-card px-4 text-base font-medium text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
        >
          {photo ? "Foto wählen" : "Datei wählen"}
        </button>
        <span className="min-w-0 truncate text-sm text-muted-foreground" aria-live="polite">
          {name || (photo ? "Kein Foto gewählt" : "Keine Datei gewählt")}
        </span>
      </div>
    );
  },
);
FileField.displayName = "FileField";

export { FileField };
