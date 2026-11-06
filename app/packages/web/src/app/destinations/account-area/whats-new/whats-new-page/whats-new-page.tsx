import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { germanDate, type NewsEntry } from "../news-lines.mjs";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { useIsLg } from "@/shared/platform/browser/use-breakpoint";
import { Button } from "@/shared/ui/button/button";
import table from "../whats-new.de.json";
import { NEWS_COUNT, NEWS_ENTRIES, appVersion, markNewsSeen } from "../whats-new";

const t = texts(table);

/**
 * Lines per page (starting values, assumption): two on a phone, three from 1024 px. The lines run long (a median of
 * about 270 characters, one of more than 1500), so a page holds few of them and every row is kept short (see LONG).
 */
const PAGE_PHONE = 2;
const PAGE_LG = 3;
/** A line longer than this shows its start in three lines and the button "Mehr anzeigen" for the rest (P-10). */
const LONG = 80;

/** One line of the changelog; a long one is clamped to three lines until the keeper asks for all of it. */
function NewsLine({ line }: { line: string }) {
  const [open, setOpen] = useState(false);
  const long = line.length > LONG;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 rounded-card border border-border p-3">
      <p className={cn("m-0 w-full min-w-0 break-words", long && !open && "line-clamp-3")}>
        {line}
      </p>
      {long && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? t("line.less") : t("line.more")}
        </Button>
      )}
    </div>
  );
}

/** The heading of a group: "Noch nicht veröffentlicht" or "Version 1.2.0 vom 06.11.2026" (US-DEV-06). */
function NewsHeading({ heading }: { heading: NonNullable<NewsEntry["heading"]> }) {
  return (
    <h2 className="m-0 text-base font-semibold">
      {heading.version === null
        ? t("heading.unreleased")
        : t("heading.version", { version: heading.version, date: germanDate(heading.date) })}
    </h2>
  );
}

/**
 * The version of the build and the lines in display order, one page at a time (US-DEV-06, US-QS-15): the unreleased
 * lines first, then each version under its heading. The pager turns the pages and keeps the page in the address. An
 * empty list says what to do next (P-09).
 */
export function WhatsNewList(props: {
  entries: readonly NewsEntry[];
  version: string | undefined;
}) {
  const navigate = useNavigate();
  const pageSize = useIsLg() ? PAGE_LG : PAGE_PHONE;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="m-0 text-sm text-muted-foreground">
        {t("version", { version: props.version ?? t("version.unknown") })}
      </p>
      {props.entries.length === 0 ? (
        <EmptyState
          title={t("empty.title")}
          description={t("empty.description")}
          action={{ label: t("empty.action"), onClick: () => void navigate(PATHS.today) }}
        />
      ) : (
        <Pager
          items={props.entries}
          pageSize={pageSize}
          label={t("list.label")}
          getKey={(_entry, index) => index}
          renderItem={(entry) => (
            <div className="flex min-w-0 flex-col gap-2">
              {entry.heading && <NewsHeading heading={entry.heading} />}
              <NewsLine line={entry.text} />
            </div>
          )}
        />
      )}
    </div>
  );
}

/**
 * The page "Neu in PflanzenDéx" in "Konto" (US-DEV-06): the lines of the changelog. Opening it marks every line as seen on
 * this device, so the hint on "Heute" does not come back for them.
 */
export function WhatsNewPage() {
  useEffect(() => {
    markNewsSeen(NEWS_COUNT);
  }, []);
  return <WhatsNewList entries={NEWS_ENTRIES} version={appVersion()} />;
}
