import { useStoredPhoto, type PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { useInView } from "@/shared/platform/visibility/use-in-view";

/** A view that shows no photos passes no access; the hook then asks for nothing and watches nothing. */
const NO_ACCESS: PhotoAccess = { api: "", token: async () => undefined };

/**
 * The thumbnail of an object row (NFR-12, SG-PHOTO-01): the picture is asked once the row is near the viewport, in its
 * thumbnail size. Put `ref` on the row's root (`ObjectRow.rootRef`). `src` stays undefined until the picture is there;
 * the row shows its placeholder meanwhile, so the box never stays empty. Without an access no observer is created.
 */
export function useObjectPhoto(
  access: PhotoAccess | undefined,
  path: string | undefined,
): [ref: (node: HTMLDivElement | null) => void, src: string | undefined] {
  const [ref, inView] = useInView<HTMLDivElement>(access !== undefined);
  const state = useStoredPhoto(access ?? NO_ACCESS, access === undefined ? undefined : path, {
    size: "thumb",
    enabled: inView,
  });
  return [ref, typeof state === "string" ? state : undefined];
}
