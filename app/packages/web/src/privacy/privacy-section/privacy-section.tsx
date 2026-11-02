import { DeletionCard } from "../deletion-card/deletion-card";
import { ExportCard } from "../export-card/export-card";

type Token = () => Promise<string | undefined>;

/**
 * "Meine Daten" in "Konto" (US-ACC-04, US-QS-17): two rows, the download and the deletion; each opens its layer
 * (US-QS-15). Both work whichever function groups are switched on, because switched-off data is the keeper's data all
 * the same.
 */
export function PrivacySection(props: { api: string; token: Token }) {
  return (
    <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
      <ExportCard {...props} />
      <DeletionCard {...props} />
    </div>
  );
}
