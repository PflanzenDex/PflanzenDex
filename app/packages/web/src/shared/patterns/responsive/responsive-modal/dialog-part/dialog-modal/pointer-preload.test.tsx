// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { ResponsiveModal } from "../../responsive-modal";

// Counts the requests of the dialog chunk. One module graph per file, so the first request is the one this file observes.
const chunk = vi.hoisted(() => ({ requests: 0 }));
vi.mock("./dialog-modal", async (importOriginal) => {
  chunk.requests += 1;
  return importOriginal();
});

// ResponsiveModal also preloads the chunk 1500 ms after mount when the viewport is md or wider. The test must see only
// the trigger's own request, so that timer is switched off (it is the only 1500 ms timer of the modal). The bound below
// is long enough for a request that is resolved under load; without a preload no request comes at all.
const IDLE_PRELOAD_MS = 1500;
const WAIT_MS = 4000;
const setTimer = window.setTimeout.bind(window);

beforeEach(() => {
  vi.spyOn(window, "setTimeout").mockImplementation(((...args: Parameters<typeof setTimer>) =>
    args[1] === IDLE_PRELOAD_MS ? 0 : setTimer(...args)) as typeof window.setTimeout);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("NFR-12 · DS-08 the dialog chunk is requested before the first click", () => {
  it("NFR-12 · DS-08 pointer enter on the dialog trigger starts the chunk request, and the trigger's own handler still runs", async () => {
    setViewportWidth(1024);
    const onPointerEnter = vi.fn();
    render(
      <ResponsiveModal
        title="Pflanze bearbeiten"
        trigger={<button onPointerEnter={onPointerEnter}>Öffnen</button>}
      >
        <button>Speichern</button>
      </ResponsiveModal>,
    );
    expect(chunk.requests).toBe(0);
    await userEvent.hover(screen.getByRole("button", { name: "Öffnen" }));
    await vi.waitFor(() => expect(chunk.requests).toBe(1), { timeout: WAIT_MS });
    expect(onPointerEnter).toHaveBeenCalledTimes(1);
  });
});
