import { lazy, Suspense, useEffect, useRef, useState, type Ref } from "react";
import { useCalmMode } from "@/achievements";
import { texts } from "@/shared/lib/text-rules/texts";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { Button } from "@/shared/ui/button/button";
import table from "../whats-new.de.json";
import type { NewsEntry } from "../news-lines.mjs";
import { appVersion, bannerBatch, endBanner, markAllNewsSeen } from "../whats-new";

const t = texts(table);
type Token = () => Promise<string | undefined>;

// The dialog's code loads on the first open, not with "Heute" (DS-08, US-QS-27).
const WhatsNewDialog = lazy(() =>
  import("./whats-new-dialog/whats-new-dialog").then((m) => ({ default: m.WhatsNewDialog })),
);

/** The banner itself: its summary, "Neuerungen ansehen" (the dialog's trigger) and "Hinweis ausblenden" (US-DEV-06). */
function BatchBanner(props: {
  count: number;
  version: string;
  opener: Ref<HTMLButtonElement>;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const summary =
    props.count === 1
      ? t("hint.one", { version: props.version })
      : t("hint.many", { version: props.version, count: props.count });
  return (
    <Banner
      variant="info"
      title={t("section.title")}
      dismissLabel={t("hint.dismiss")}
      onDismiss={props.onDismiss}
      className="mb-3"
    >
      <p className="m-0">{summary}</p>
      <Button
        ref={props.opener}
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        aria-haspopup="dialog"
        onClick={props.onOpen}
      >
        {t("hint.open")}
      </Button>
    </Banner>
  );
}

/**
 * The banner on "Heute" after an update (US-DEV-06, US-QS-27): "Neu in PflanzenDéx" with the version and the number of lines
 * this device has not seen, as one batch. The batch is taken once the calm setting is known as off: it shows on every visit
 * of "Heute" in the session in which it first shows, so a short visit does not use it up; in a later session a batch that was
 * shown before counts as seen. "Neuerungen ansehen" opens the batch in a dialog and "Hinweis ausblenden" closes the banner; both
 * end it at once, on this visit and for every later one. Closing the dialog returns the focus to the start of the view
 * (`returnFocus`), as the banner is gone. Calm mode switches the hint off and not the information (US-ONB-07, US-ACH-08): no
 * banner, and the lines count as seen at once, so a later switch of calm mode shows no catch-up banner. While the setting is
 * not known, nothing shows and nothing is counted. A first visit shows nothing. The banner is the shared banner (DS-34).
 */
export function WhatsNewHint(props: { api: string; token: Token }) {
  const calm = useCalmMode(props.api, props.token);
  const [batch, setBatch] = useState<readonly NewsEntry[]>([]);
  const [closed, setClosed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogUsed, setDialogUsed] = useState(false);
  const decided = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);

  // Decided once, when the calm setting is known: calm mode counts the lines as seen at once (US-ACH-08); otherwise the
  // banner takes its batch (US-QS-27).
  useEffect(() => {
    if (calm === undefined || decided.current) return;
    decided.current = true;
    if (calm) markAllNewsSeen();
    else setBatch(bannerBatch());
  }, [calm]);

  const version = appVersion() ?? t("version.unknown");
  const end = () => {
    endBanner(batch);
    setClosed(true);
  };
  return (
    <>
      {batch.length > 0 && !closed ? (
        <BatchBanner
          count={batch.length}
          version={version}
          opener={opener}
          onDismiss={end}
          onOpen={() => {
            end();
            setDialogUsed(true);
            setDialogOpen(true);
          }}
        />
      ) : null}
      {dialogUsed ? (
        <Suspense fallback={null}>
          <WhatsNewDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            lines={batch}
            version={version}
            opener={opener}
          />
        </Suspense>
      ) : null}
    </>
  );
}
