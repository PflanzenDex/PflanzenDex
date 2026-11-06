// Undo of a failed claim (US-DEV-08, #1487). Every write of a claim registers an undo step before it runs: { label, step, byHand }.
// The steps run in reverse; each one is tried a few times, so a network blip does not leave a half claim, and a step that still
// fails prints the command to run by hand (P-10).
const UNDO_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs the undo steps in reverse. A step may return a note for the log (for example "left alone: not our commit").
 * retryDelayMs grows with each attempt; tests pass 0.
 */
export async function rollBack(undo, log, retryDelayMs) {
  for (const { label, step, byHand } of [...undo].reverse()) {
    let failure;
    for (let attempt = 1; attempt <= UNDO_ATTEMPTS; attempt += 1) {
      try {
        const note = await step();
        failure = undefined;
        log(`Rolled back: ${label}${note ? ` (${note})` : ""}`);
        break;
      } catch (e) {
        failure = e;
        if (attempt < UNDO_ATTEMPTS) await sleep(retryDelayMs * attempt);
      }
    }
    if (failure) {
      log(
        `WARNING: could not roll back "${label}" (${failure.message}); undo it by hand: ${byHand}`,
      );
    }
  }
}
