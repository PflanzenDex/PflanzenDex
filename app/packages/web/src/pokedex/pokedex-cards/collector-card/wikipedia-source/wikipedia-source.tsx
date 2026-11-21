import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../collector-card.de.json";

const t = texts(table);

/**
 * Source and license of Wikipedia content (US-QS-06, FR-POK-07): a link when the source is known; when text or image are
 * shown without one, the source and license are still named, as text (P-08). Without Wikipedia content: nothing.
 */
export function WikipediaSource(props: {
  label: string;
  sourceUrl: string | null;
  shown: boolean;
  className?: string;
}) {
  const text = t("source.wikipedia", { label: props.label });
  if (props.sourceUrl !== null)
    return (
      <a
        href={props.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("text-sm underline", props.className)}
      >
        {text}
      </a>
    );
  if (!props.shown) return null;
  return (
    <span className="text-sm text-muted-foreground">
      {t("source.wikipediaNoLink", { label: props.label })}
    </span>
  );
}
