import { DeletionCard } from "../deletion-card/deletion-card";
import { ExportCard } from "../export-card/export-card";

type Token = () => Promise<string | undefined>;

/**
 * "Meine Daten" in "Konto" (US-ACC-04): download of all own data and deleting the account. Both work whichever function
 * groups are switched on, because switched-off data is the keeper's data all the same.
 */
export function PrivacySection(props: { api: string; token: Token }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ExportCard {...props} />
      <DeletionCard {...props} />
    </div>
  );
}
