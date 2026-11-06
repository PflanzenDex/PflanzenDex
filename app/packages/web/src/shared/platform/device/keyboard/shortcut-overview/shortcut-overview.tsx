import { Keyboard } from "lucide-react";
import { texts } from "@/shared/lib/text-rules/texts";
import { Button } from "@/shared/ui/button/button";
import {
  focusModalTitle,
  ResponsiveModal,
} from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { useShortcuts } from "../shortcut-provider/shortcut-provider";
import table from "./shortcut-overview.de.json";

const t = texts(table);

export type ShortcutOverviewRow = { id: string; keys: string; label: string };

/**
 * The overview of every keyboard shortcut (US-QS-11): opened by `?` and by the help entry, a bottom sheet on a phone and
 * a dialog from `md`. It lists the keys the mode shows, says when the shortcuts are off and where they come back on, and
 * closes with Escape, the close button or the outside, which returns the focus to its opener (DS-40).
 */
export function ShortcutOverview(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: readonly ShortcutOverviewRow[];
  /** The shortcuts are switched off: the list still shows the keys, and the overview says so (P-10). */
  off: boolean;
}) {
  return (
    <ResponsiveModal
      title={t("overview.title")}
      closeLabel={t("overview.close")}
      open={props.open}
      onOpenChange={props.onOpenChange}
      onOpenAutoFocus={focusModalTitle}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("overview.intro")}</p>
        {props.off ? (
          <p role="status" className="rounded-lg border border-border p-3">
            {t("overview.off")}
          </p>
        ) : null}
        <section aria-labelledby="shortcut-overview-everywhere" className="flex flex-col gap-2">
          <h3 id="shortcut-overview-everywhere" className="text-base font-semibold">
            {t("overview.everywhere")}
          </h3>
          <ul className="flex flex-col divide-y divide-border">
            {props.rows.map((row) => (
              <li
                key={row.id}
                className="flex min-h-[44px] items-center justify-between gap-3 py-1"
              >
                <span>{row.label}</span>
                <kbd className="whitespace-nowrap rounded-md border border-border bg-muted px-2 py-1 font-mono text-sm">
                  {row.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ResponsiveModal>
  );
}

/**
 * The help entry of the shortcuts (US-QS-09, US-QS-11): the same overview that `?` opens. An icon button of 44 px in the
 * section header, named for assistive technology; on desktop its key is shown beside the icon.
 */
export function ShortcutHelpButton() {
  const { openOverview, hint } = useShortcuts();
  const key = hint("overview");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="w-auto shrink-0 gap-2 px-3"
      aria-label={t("help.button")}
      aria-keyshortcuts={key?.aria}
      onClick={openOverview}
    >
      <Keyboard aria-hidden="true" className="size-5" />
      {key ? (
        <kbd aria-hidden="true" className="hidden font-mono text-xs font-normal md:inline">
          {key.visible}
        </kbd>
      ) : null}
    </Button>
  );
}
