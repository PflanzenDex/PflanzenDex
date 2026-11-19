import { useEffect, useRef } from "react";
import { useOnline } from "@/shared/platform/browser/network";
import { texts } from "@/shared/lib/text-rules/texts";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import table from "../../../today.de.json";

const t = texts(table);

/**
 * A failed list of the page: one flat line with its retry in an alert, without the card and shadow of a page error
 * (SG-STATE-01). Back online it loads again by itself, as the request states do (US-QS-32, issue 1884).
 */
export function ListFailure(props: { text: string | undefined; onRetry: () => void }) {
  const { onRetry } = props;
  const online = useOnline();
  const wasOnline = useRef(online);
  useEffect(() => {
    const back = online && !wasOnline.current;
    wasOnline.current = online;
    if (back) onRetry();
  }, [online, onRetry]);
  return (
    <div role="alert">
      <EmptySection
        text={props.text ?? t("failed")}
        action={{ label: t("retry"), onClick: onRetry }}
      />
    </div>
  );
}
