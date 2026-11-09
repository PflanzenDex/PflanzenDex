import * as React from "react";
import { cn } from "@/shared/lib/utils";
import type { InputProps } from "../../input";

/**
 * The one file picker (US-QS-24): a German button instead of the browser's "Choose File / No file chosen".
 * The native input is the only control and the only Tab stop (US-QS-08, issue 1730): it lies over the visible
 * label with the same box and border, so a click or tap on the label opens the picker. The label draws the focus
 * ring of the input (`peer-focus-visible`) and, in forced colors (US-QS-12), a system-coloured outline, because
 * forced colors drop the ring's box shadow. "Foto wählen" when it accepts images, else "Datei wählen".
 */
const FileField = React.forwardRef<HTMLInputElement, Omit<InputProps, "type" | "value">>(
  ({ className, onChange, accept, id, ...props }, ref) => {
    const [name, setName] = React.useState("");
    const photo = !accept || accept.includes("image");
    return (
      <div className={cn("flex min-h-[44px] items-center gap-3", className)}>
        <div className="relative inline-flex shrink-0">
          <input
            {...props}
            id={id}
            ref={ref}
            type="file"
            accept={accept}
            className="peer absolute inset-0 h-full w-full cursor-pointer rounded-control border border-input opacity-0"
            onChange={(e) => {
              setName(e.target.files?.[0]?.name ?? "");
              onChange?.(e);
            }}
          />
          <span
            aria-hidden="true"
            className="inline-flex min-h-[44px] items-center rounded-control border border-input bg-card px-4 text-base font-medium text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background forced-colors:peer-focus-visible:outline-2 forced-colors:peer-focus-visible:outline-offset-2 forced-colors:peer-focus-visible:outline-[color:Highlight] forced-colors:peer-focus-visible:outline-solid"
          >
            {photo ? "Foto wählen" : "Datei wählen"}
          </span>
        </div>
        <span className="min-w-0 truncate text-sm text-muted-foreground" aria-live="polite">
          {name || (photo ? "Kein Foto gewählt" : "Keine Datei gewählt")}
        </span>
      </div>
    );
  },
);
FileField.displayName = "FileField";

export { FileField };
