import { useId, type ComponentType } from "react";
import { CircleCheck, CircleDashed } from "lucide-react";
import { texts } from "@/shared/lib/text-rules/texts";
import type { AchievementItem } from "../../achievements-api";
import table from "../overview.de.json";

const t = texts(table);

/** The earned or the open achievements of one group, shown as one section (US-ACH-02). */
export type AchievementSection = { kind: "earned" | "open"; items: AchievementItem[] };

/**
 * One state of a group (US-ACH-02): "Erreicht" or "Noch offen" with its icon, then its cards (`card`). Both states are
 * always shown (SG-LIST-06). An empty one adds no line: its quiet text follows the heading on the same line ("Erreicht ·
 * noch keiner", SG-LIST-08), so the layer keeps its height at 360 × 640. The heading is one level below the layer's
 * title (SG-HEAD-03); the icon is a decoration, the text names the state (SG-COLOR-05).
 */
export function StateSection({
  section,
  card: Card,
}: {
  section: AchievementSection;
  card: ComponentType<{ item: AchievementItem }>;
}) {
  const id = useId();
  const earned = section.kind === "earned";
  const Icon = earned ? CircleCheck : CircleDashed;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <h3 id={id} className="m-0 flex items-center gap-2 text-base font-semibold">
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span>
          {t(earned ? "earned" : "open")}
          {section.items.length === 0 ? (
            <>
              {" "}
              <span className="font-normal text-muted-foreground">
                · {t(earned ? "noneEarned" : "allEarned")}
              </span>
            </>
          ) : null}
        </span>
      </h3>
      {section.items.map((item) => (
        <Card key={item.id} item={item} />
      ))}
    </section>
  );
}
