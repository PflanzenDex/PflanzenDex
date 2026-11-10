import { Button } from "@/shared/ui/button/button";
import {
  DelayedSkeleton,
  useHeldLoader,
} from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { ResponsiveModal } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { useStoredPhoto, type PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import table from "../../../wishlist.de.json";

const t = texts(table);

/**
 * The large view of a stored picture (US-WUN-06). It is mounted only while it is open, so the full copy (no size) is asked
 * for only after the tap (NFR-12); the cache keeps it for the next opening. Escape and the close button call `onClose`.
 * The image never forces a sideways scroll: it is bounded to the visible height and width. A phone sheet has no close
 * button of its own, so it gets one in the content; the dialog from md has its close button already.
 */
export function LargePicture(props: {
  access: PhotoAccess;
  path: string;
  title: string;
  sourceLine: string;
  onClose: () => void;
}) {
  const { access, path, title, sourceLine, onClose } = props;
  const state = useStoredPhoto(access, path);
  // The picture's loading status holds once shown (US-QS-14, D5, issue 1772); the picture waits for the hold.
  const loading = useHeldLoader(!state);
  const isMd = useIsMd();
  return (
    <ResponsiveModal
      title={t("large.title", { title })}
      closeLabel={t("large.close")}
      open
      onOpenChange={(open) => !open && onClose()}
    >
      {loading ? (
        <DelayedSkeleton>
          <p role="status" className="text-muted-foreground">
            {t("picture.loading")}
          </p>
        </DelayedSkeleton>
      ) : typeof state === "string" ? (
        <img
          src={state}
          alt={t("picture.alt", { title })}
          className="mx-auto block max-h-[60dvh] max-w-full object-contain"
        />
      ) : state ? (
        <p role="alert" className="text-destructive">
          {errorText(state.code)}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{sourceLine}</p>
      {!isMd && (
        <Button type="button" variant="outline" size="touch" onClick={onClose}>
          {t("large.close")}
        </Button>
      )}
    </ResponsiveModal>
  );
}
