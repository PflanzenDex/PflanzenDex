import { Link } from "react-router";
import { texts } from "@/shared/lib/text-rules/texts";
import { accountAddress } from "@/shared/patterns/navigation/navigation/navigation";
import { returnFocus } from "@/shared/platform/routing/route-focus/view-start";
import { Dialog, DialogContent } from "@/shared/ui/overlays/dialog/dialog";
import { germanDate, type NewsEntry } from "../../news-lines.mjs";
import table from "../../whats-new.de.json";

const t = texts(table);

/** The heading of a group of lines: "Noch nicht veröffentlicht" or "Version 1.2.0 vom 06.11.2026" (as on the page). */
function headingText(heading: NonNullable<NewsEntry["heading"]>): string {
  return heading.version === null
    ? t("heading.unreleased")
    : t("heading.version", { version: heading.version, date: germanDate(heading.date) });
}

/**
 * The lines the banner of "Heute" opened (US-QS-27): the same texts as the page, newest first, and the link to the full page
 * "Neu in PflanzenDéx" inside the dialog. Closing it returns the focus to the opener when that is still on the page, else to
 * the start of the view (`returnFocus`). Its own lazy part: the dialog code loads on the first open (DS-08).
 */
export function WhatsNewDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: readonly NewsEntry[];
  version: string;
  opener: { readonly current: HTMLElement | null };
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        title={t("section.title")}
        description={t("version", { version: props.version })}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus(props.opener.current);
        }}
      >
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {props.lines.map((entry, index) => (
            <li key={index} className="flex min-w-0 flex-col gap-1">
              {entry.heading ? (
                <h3 className="m-0 text-sm font-semibold">{headingText(entry.heading)}</h3>
              ) : null}
              <p className="m-0 break-words text-sm">{entry.text}</p>
            </li>
          ))}
        </ul>
        <Link to={accountAddress("news")} className="self-start underline">
          {t("dialog.all")}
        </Link>
      </DialogContent>
    </Dialog>
  );
}
