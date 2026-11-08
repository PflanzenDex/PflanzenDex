import { SettingsPageSkeleton } from "@/account";
import { texts } from "@/shared/lib/text-rules/texts";
import type { AccountSection } from "@/shared/patterns/navigation/navigation/navigation";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import { SECTIONS } from "./account-model/account-model";
import table from "./account-area.de.json";

const t = texts(table);

/** The kind of content a section shows, so each section's skeleton has the shape of that content (US-QS-14, DS-52). */
const KIND: Record<Exclude<AccountSection, "settings">, "form" | "cards" | "rows"> = {
  profile: "form",
  reminders: "form",
  achievements: "cards",
  measured: "cards",
  data: "cards",
  aiClients: "rows",
  functions: "rows",
  news: "rows",
};

/** Fields with their labels: the profile and the reminder settings (DS-52). */
function FormBlocks() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
      <Skeleton className="h-12 w-40" />
    </>
  );
}

/** Cards of the content: achievements, what is measured, the data (DS-52). */
function CardBlocks() {
  return (
    <>
      <Skeleton className="h-28 w-full rounded-card" />
      <Skeleton className="h-28 w-full rounded-card" />
    </>
  );
}

/** Rows of a list: the AI clients, the functions, the news (DS-52). */
function RowBlocks() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-control" />
      ))}
    </>
  );
}

/**
 * The skeleton of one section of "Konto" while its content loads (US-QS-14, DS-52, DS-53): the settings keep their six
 * rows, the other sections the shape of their content. It shows after the delay (DS-57) and carries the one status.
 */
export function AccountSectionSkeleton({
  section,
  label,
}: {
  section: AccountSection;
  label: string;
}) {
  if (section === "settings")
    return (
      <DelayedSkeleton>
        <SettingsPageSkeleton label={label} />
      </DelayedSkeleton>
    );
  const kind = KIND[section];
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        {kind === "form" ? <FormBlocks /> : kind === "cards" ? <CardBlocks /> : <RowBlocks />}
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}

/**
 * The route's fallback of "Konto" until its chunk is there (US-QS-14, issue 1697): the title stands at once as the one h1,
 * then the index's rows, or the section's own skeleton when the address names a section.
 */
export function AccountRouteSkeleton({
  section,
}: {
  section: AccountSection | "unknown" | undefined;
}) {
  const known = section === undefined || section === "unknown" ? undefined : section;
  const info = known === undefined ? undefined : SECTIONS.find((s) => s.key === known);
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:gap-6">
      <h1 data-route-fallback="" className="text-2xl font-semibold">
        {t("title")}
      </h1>
      {known === undefined || info === undefined ? (
        <DelayedSkeleton>
          <SkeletonGroup label={t("index.loading")} className="flex min-w-0 flex-col gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-control" />
            ))}
          </SkeletonGroup>
        </DelayedSkeleton>
      ) : (
        <AccountSectionSkeleton section={known} label={info.loading} />
      )}
    </div>
  );
}
