import type { ArchivedEntry } from "@pflanzendex/core";
import { Card } from "@/components/data-display/card/card";
import { Button } from "@/components/ui/button";
import { Actions, GRID, Quiet, SUBTITLE } from "./parts";
import { UNKNOWN, dateText } from "./text";

/**
 * The archive (US-BES-07): archived specimens with species, date and reason, each with "Restore". Without archived
 * specimens the section does not exist.
 */
export function ArchivedList(props: {
  entries: readonly ArchivedEntry[];
  onRestore: (e: { id: string; name: string }) => void;
}) {
  if (props.entries.length === 0) return null;
  return (
    <section aria-labelledby="archived-title" className="mt-6">
      <h2 id="archived-title" className={SUBTITLE}>
        Archiv
      </h2>
      <Quiet className="mb-3">
        Archivierte Exemplare fehlen in Liste und Auswertungen. Ihre Historie bleibt erhalten.
      </Quiet>
      <ul className={GRID}>
        {props.entries.map((e) => (
          <li key={e.id}>
            <Card className="grid gap-1 break-words">
              <h3 className="text-lg font-semibold">{e.name}</h3>
              <Quiet>Art: {e.speciesName ?? UNKNOWN}</Quiet>
              <Quiet>Archiviert am {dateText(e.archivedAt)}</Quiet>
              <Quiet>Grund: {e.archivedReason}</Quiet>
              <Actions>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Wiederherstellen: ${e.name}`}
                  onClick={() => props.onRestore(e)}
                >
                  Wiederherstellen
                </Button>
              </Actions>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
