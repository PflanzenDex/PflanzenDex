import type { Specimen } from "@pflanzendex/core";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { entityRun, useInvalidate, useWriteAction } from "@/shared/data";
import { errorText } from "@/shared/lib/error-text";
import { UNKNOWN, dateText } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { Button } from "@/shared/ui/button";
import { restoreSpecimen } from "../../archived/archived-api";
import { COLLECTION_KEY } from "../../specimens/hooks/use-collection";
import table from "./pot-label-page.de.json";

type Token = () => Promise<string | undefined>;
const ui = texts(table);

const dateOf = (iso: string | null) => (iso ? dateText(iso) : UNKNOWN);
/** An archived plant (owner answers Q-85 and Q-137, US-QS-32): read-only, "Archiviert am …" on top, and the one action "Pflanze wiederherstellen". */
export function Archived(props: { api: string; token: Token; id: string; specimen: Specimen }) {
  const { api, token, id, specimen } = props;
  const refresh = useInvalidate(COLLECTION_KEY);
  const reloadLabel = useInvalidate(["label", "specimen", id]);
  const write = useWriteAction(token, () => {
    refresh();
    reloadLabel();
  });
  const run = entityRun(write, "specimen", id);
  return (
    <section aria-labelledby="pot-label-title" className="flex min-w-0 flex-col gap-4">
      <PageHeader headingId="pot-label-title" title={specimen.name} />
      <p className="text-sm">{ui("archivedOn", { date: dateOf(specimen.archivedAt) })}</p>
      <p className="text-sm">{ui("reason", { reason: specimen.archivedReason ?? UNKNOWN })}</p>
      <p className="text-sm">
        {specimen.caughtAt
          ? ui("caughtOn", { date: dateOf(specimen.caughtAt) })
          : ui("caughtUnknown")}
      </p>
      {write.message ? (
        <p role="status" className="text-sm">
          {write.message}
        </p>
      ) : null}
      {write.error ? (
        <p role="alert" className="rounded-lg border border-destructive p-2 text-sm">
          {errorText(write.error.code)}
          <RefusalClose error={write.error} />
        </p>
      ) : null}
      <Button
        type="button"
        size="touch"
        variant="tinted"
        disabled={write.running}
        onClick={() => run((t, o) => restoreSpecimen(api, t, id, o), ui("restored"), "restore")}
      >
        {ui("restore")}
      </Button>
    </section>
  );
}
