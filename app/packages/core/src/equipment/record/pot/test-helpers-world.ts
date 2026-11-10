import { InMemoryEquipment } from "../../store/test-helpers";
import { InMemorySpecimens } from "../../../collection/shared/test-helpers";
import { InMemoryPotPlacements, InMemoryPotRepotUnit } from "./test-helpers";

export const PRIMARY = "anna";
export const SPECIES = "11111111-1111-4111-8111-111111111111";

/** The in-memory stores of one test: plants, pots and the placements between them. */
export function world() {
  const specimens = new InMemorySpecimens();
  const equipment = new InMemoryEquipment();
  const placements = new InMemoryPotPlacements(equipment, specimens);
  const save = () => {
    const rows = [...specimens.rows];
    const repots = [...specimens.repotLog.repots];
    const signs = specimens.repotLog.signs.map((s) => ({ ...s }));
    const open = placements.placements.map((p) => ({ ...p }));
    return () => {
      specimens.rows.splice(0, specimens.rows.length, ...rows);
      specimens.repotLog.repots.splice(0, specimens.repotLog.repots.length, ...repots);
      specimens.repotLog.signs.splice(0, specimens.repotLog.signs.length, ...signs);
      placements.placements.splice(0, placements.placements.length, ...open);
    };
  };
  const unit = new InMemoryPotRepotUnit({ specimens, pots: placements }, save);
  return { specimens, equipment, placements, unit };
}

/** A pot record of the account: a `Pot` with its size, active unless `status` says otherwise (US-BES-19). */
export async function makePot(
  equipment: InMemoryEquipment,
  userId: string,
  name: string,
  diameterCm: number | null,
) {
  const row = await equipment.create(
    userId,
    {
      type: "Pot",
      name,
      manufacturer: null,
      model: null,
      productId: null,
      priceEur: null,
      boughtAt: null,
      note: null,
      lightZoneId: null,
      diameterCm,
      heightCm: null,
      material: "Terrakotta",
      drainage: true,
    },
    "active",
  );
  if (typeof row === "string") throw new Error(row);
  return row.id;
}

export async function makePlant(
  specimens: InMemorySpecimens,
  userId: string,
  name: string,
  status: "plant" | "cutting" = "plant",
) {
  const row = await specimens.create(userId, {
    speciesId: SPECIES,
    name,
    marker: null,
    locationId: null,
    caughtAt: "2026-09-01",
    status,
  });
  if (typeof row === "string") throw new Error(row);
  return row.id;
}
