import { useEffect } from "react";
import { useNavigate } from "react-router";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../whats-new.de.json";
import { NEWS_LINES, appVersion, markNewsSeen } from "../whats-new";

const t = texts(table);

/** The version of the build and the lines, newest first; an empty list says what to do next (P-09). */
export function WhatsNewList(props: { lines: readonly string[]; version: string | undefined }) {
  const navigate = useNavigate();
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
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {props.lines.map((line) => (
            <li key={line} className="min-w-0 break-words rounded-card border border-border p-3">
              {line}
            </li>
          ))}
        </ul>
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
