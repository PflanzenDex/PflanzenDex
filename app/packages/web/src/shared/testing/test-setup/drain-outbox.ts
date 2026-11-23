import { deliverBuffered } from "../../platform/announcer/outbox";

/**
 * Empties the write buffer after a test (US-QS-10). The buffer is module-level, so a write that a test left in it is sent by
 * the next test that delivers. The device is signed out first: every buffered write is then refused and dropped without a
 * network call (US-QS-07). A delivery still running when the test ends finishes its request within a few turns of the event
 * loop, and its remaining writes are refused in the same way. The turns use real timers: restore them first.
 * Call it in `afterEach`, after the fetch stubs are restored.
 */
export async function drainOutbox(): Promise<void> {
  window.localStorage.clear();
  for (let turn = 0; turn < 5; turn++) {
    await deliverBuffered();
    await new Promise((done) => setTimeout(done, 0));
  }
}
