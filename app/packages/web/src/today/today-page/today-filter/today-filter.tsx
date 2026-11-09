import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../today.de.json";

const t = texts(table);

/**
 * "Heute" narrowed to one kind of task (`?tasks=watering`, US-QS-26): the page title, a notice that the filter is on and
 * which tasks stay hidden (P-10), the one control that clears it (P-09), and the filtered list as `children`. The notice
 * stays above the list, so the filter is the first thing read after the title.
 */
export function TodayFilter(props: { onClear: () => void; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <h1 id="today-title" className="text-2xl font-semibold">
        {t("page.title")}
      </h1>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
        <p className="min-w-0 text-sm">
          <span className="font-medium">{t("filter.shown")}</span> {t("filter.hidden")}
        </p>
        <Button variant="outline" size="sm" onClick={props.onClear}>
          {t("filter.clear")}
        </Button>
      </div>
      <section aria-labelledby="filter-title" className="flex min-w-0 flex-col gap-2">
        <h2 id="filter-title" className="sr-only">
          {t("filter.title")}
        </h2>
        {props.children}
      </section>
    </div>
  );
}
