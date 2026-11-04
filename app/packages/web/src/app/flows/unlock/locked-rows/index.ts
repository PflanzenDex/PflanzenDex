// Public interface of the locked rows (US-ONB-05): the list of locked entries and the collapsed parts of a layer or tile.
// The routes import it directly: the shell's first load does not carry the rows (NFR-12).
export { LockedRows } from "./locked-rows";
export { LockedLayer, LockedTile } from "./collapsed-rows/collapsed-rows";
