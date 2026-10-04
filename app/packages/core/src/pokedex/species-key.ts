// Species key of a Latin name (US-POK-06): the first two words, hybrid sign skipped, epithet in lower case. Additions
// (`var.`, `subsp.`, `f.`, `'Cultivar'`) do not flow into the assignment but become a chip on the card.
import type { SpeciesKey } from "./types";

const HYBRID_SIGNS = new Set(["x", "×"]);
/** "sp." and "spp." stand for "species unknown": no epithet. */
const UNKNOWN_EPITHET = new Set(["sp.", "spp."]);
const RANK_MARKERS = new Set(["var.", "subsp.", "ssp.", "f.", "cv."]);
const EPITHET = /^[a-z][a-z-]*$/;

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
const isAddition = (word: string) => RANK_MARKERS.has(word.toLowerCase()) || word.startsWith("'");

export function speciesKey(latinName: string): SpeciesKey {
  const words = latinName.split(/\s+/).filter((w) => w !== "");
  const [first, ...rest] = words;
  if (first === undefined) return { species: null, genus: null, epithet: null, chip: null };
  const genus = capitalized(first);
  const afterGenus = rest.filter((w, i) => !(i === 0 && HYBRID_SIGNS.has(w.toLowerCase())));
  const head = afterGenus[0];
  const hasEpithet =
    head !== undefined &&
    !isAddition(head) &&
    !UNKNOWN_EPITHET.has(head.toLowerCase()) &&
    EPITHET.test(head.toLowerCase());
  const epithet = hasEpithet ? head.toLowerCase() : null;
  const tail = afterGenus.slice(hasEpithet ? 1 : 0);
  const additionAt = tail.findIndex(isAddition);
  const chip = additionAt === -1 ? null : tail.slice(additionAt).join(" ");
  return {
    species: epithet === null ? null : `${genus} ${epithet}`,
    genus,
    epithet,
    chip,
  };
}
