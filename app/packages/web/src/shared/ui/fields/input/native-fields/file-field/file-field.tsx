import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import type { InputProps } from "../../input";
import table from "./file-field.de.json";

const t = texts(table);

const INPUT =
  "peer absolute inset-0 h-full w-full cursor-pointer rounded-control border border-input opacity-0";
const FACE =
  "inline-flex min-h-[44px] items-center rounded-control border border-input bg-card px-4 text-base font-medium text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background forced-colors:peer-focus-visible:outline-2 forced-colors:peer-focus-visible:outline-offset-2 forced-colors:peer-focus-visible:outline-[color:Highlight] forced-colors:peer-focus-visible:outline-solid";

/**
 * The one file picker (US-QS-24): a German button instead of the browser's "Choose File / No file chosen".
 * A native input is the only control and the only Tab stop of a button (US-QS-08, issue 1730): it lies over the visible
 * label with the same box and border, so a click or tap on the label opens the picker. The label draws the focus
 * ring of the input (`peer-focus-visible`) and, in forced colors (US-QS-12), a system-coloured outline, because
 * forced colors drop the ring's box shadow. "Foto wählen" when it accepts images, else "Datei wählen".
 *
 * A photo field has a second button "Foto aufnehmen" on touch devices (US-QS-07, issue 1820): the photo picker of
 * Android shows the gallery and no camera, so a second input asks for the camera (`capture`). Both inputs call the same
 * `onChange`. With a fine pointer it is hidden: a desktop browser opens the same file dialog for it.
 */
const FileField = React.forwardRef<HTMLInputElement, Omit<InputProps, "type" | "value">>(
  ({ className, onChange, accept, id, ...props }, ref) => {
    const [name, setName] = React.useState("");
    const photo = !accept || accept.includes("image");
    const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
      setName(e.target.files?.[0]?.name ?? "");
      onChange?.(e);
    };
    return (
      <div className={cn("flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-2", className)}>
        {photo && (
          <div className="relative hidden shrink-0 pointer-coarse:inline-flex">
            <input
              type="file"
              accept={accept}
              capture="environment"
              aria-label={t("photo.take")}
              disabled={props.disabled}
              className={INPUT}
              onChange={picked}
            />
            <span aria-hidden="true" className={FACE}>
              {t("photo.take")}
            </span>
          </div>
        )}
        <div className="relative inline-flex shrink-0">
          <input
            {...props}
            id={id}
            ref={ref}
            type="file"
            accept={accept}
            className={INPUT}
            onChange={picked}
          />
          <span aria-hidden="true" className={FACE}>
            {photo ? t("photo.choose") : t("file.choose")}
          </span>
        </div>
        <span className="min-w-0 truncate text-sm text-muted-foreground" aria-live="polite">
          {name || (photo ? t("photo.none") : t("file.none"))}
        </span>
      </div>
    );
  },
);
FileField.displayName = "FileField";

export { FileField };
