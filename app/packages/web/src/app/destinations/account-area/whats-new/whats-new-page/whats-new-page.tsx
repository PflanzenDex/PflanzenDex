import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { useIsLg } from "@/shared/platform/browser/use-breakpoint";
import { Button } from "@/shared/ui/button/button";
import table from "../whats-new.de.json";
import { NEWS_LINES, appVersion, markNewsSeen } from "../whats-new";

const t = texts(table);

/**
 * Lines per page (starting values, assumption): two on a phone, three from 1024 px. The lines run long (a median of
 * about 270 characters, one of more than 1500), so a page holds few of them and every row is kept short (see LONG).
 */
const PAGE_PHONE = 2;
const PAGE_LG = 3;
/** A line longer than this shows its start in three lines and the button "Mehr anzeigen" for the rest (P-10). */
const LONG = 80;

/**
 * One line of the changelog; a long one is clamped to three lines until the keeper asks for all of it. While clamped,
 * the text carries `data-clamped`, so the display check reads the clamp as deliberate (US-QS-12, see layoutProblems).
 */
function NewsLine({ line }: { line: string }) {
  const [open, setOpen] = useState(false);
  const long = line.length > LONG;
  const clamped = long && !open;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 rounded-card border border-border p-3">
      <p
        {...(clamped ? { "data-clamped": "" } : {})}
        className={cn("m-0 w-full min-w-0 break-words", clamped && "line-clamp-3")}
      >
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

/**
 * The version of the build and the lines, newest first, one page at a time (US-DEV-06, US-QS-15): the pager turns the
 * pages and keeps the first entry of the page in the address. An empty list says what to do next (P-09).
 */
export function WhatsNewList(props: { lines: readonly string[]; version: string | undefined }) {
  const navigate = useNavigate();
  const pageSize = useIsLg() ? PAGE_LG : PAGE_PHONE;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="m-0 text-sm text-muted-foreground">
        {t("version", { version: props.version ?? t("version.unknown") })}
      </p>
      {props.lines.length === 0 ? (
        <EmptyState
          title={t("empty.title")}
          description={t("empty.description")}
          action={{ label: t("empty.action"), onClick: () => void navigate(PATHS.today) }}
        />
      ) : (
        <Pager
          items={props.lines}
          pageSize={pageSize}
          label={t("list.label")}
          getKey={(_line, index) => index}
          renderItem={(line) => <NewsLine line={line} />}
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
    markNewsSeen(NEWS_LINES.length);
  }, []);
  return <WhatsNewList lines={NEWS_LINES} version={appVersion()} />;
}
