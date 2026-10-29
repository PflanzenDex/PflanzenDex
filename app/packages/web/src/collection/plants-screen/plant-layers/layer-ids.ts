import type { ArchivedEntry, Distribution, SpecimenCard } from "@pflanzendex/core";
import type { PhotoAccess } from "@/lib/use-stored-photo";

export const ARCHIVE_LAYER = "archive";

export type Handlers = {
  onMeasure?: ((e: SpecimenCard) => void) | undefined;
  onArchive?: ((e: SpecimenCard) => void) | undefined;
  onRepot?: ((e: SpecimenCard) => void) | undefined;
  onMark?: ((e: SpecimenCard) => void) | undefined;
  onCatchDate?: ((e: SpecimenCard) => void) | undefined;
  onLightZone?: ((e: SpecimenCard) => void) | undefined;
};

export type LayerProps = Handlers & {
  cards: readonly SpecimenCard[];
  distribution: Distribution;
  archived: readonly ArchivedEntry[];
  photoAccess: PhotoAccess;
  onManage: () => void;
  onRestore: (e: { id: string; name: string }) => void;
  onArchivedCatchDate: (e: { id: string; name: string; caughtAt: string | null }) => void;
};
