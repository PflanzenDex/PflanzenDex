import { texts } from "@/shared/lib/text-rules/texts";
import { Banner } from "@/shared/patterns/states/banner/banner";
import table from "../../account-area.de.json";

const t = texts(table);

/**
 * The failure of "Auf allen Geräten abmelden" (US-ACC-01): the one error tone, and "Erneut versuchen" repeats that
 * sign-out, unless one runs already (US-QS-32, SG-STATE-03).
 */
export function EverywhereError(props: {
  text: string;
  busy?: boolean | undefined;
  onRetry: () => void;
}) {
  return (
    <Banner
      variant="error"
      action={{
        label: t("index.retry"),
        onClick: () => {
          if (!props.busy) props.onRetry();
        },
      }}
    >
      {props.text}
    </Banner>
  );
}
