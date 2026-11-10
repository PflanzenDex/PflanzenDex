// Public interface of the lock states in the shell (US-ONB-05): provider and the lock marks; the rows live in ./locked-rows.
export { UnlocksProvider, useUnlocks } from "./model/unlocks/unlocks";
export { isShownLocked, lockMark } from "./model/unlock-texts";
