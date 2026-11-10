// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { RouteFocus } from "./route-focus";

// The focus handling is a chunk of its own (DS-08): here it stays unloaded until the test lets it through.
// `loaded` resolves once RouteFocus has received the handler, so a test waits for that event, not for a time (issue 1483).
const chunk = vi.hoisted(() => ({
  open: () => {},
  gate: Promise.resolve(),
  loaded: Promise.resolve(),
  markLoaded: () => {},
}));
vi.mock("./focus-moves", async (original) => {
  const real = await original<typeof import("./focus-moves")>();
  return {
    createFocusMover: () =>
      chunk.gate.then(() => {
        chunk.markLoaded();
        return real.createFocusMover();
      }),
  };
});

beforeEach(() => {
  chunk.gate = new Promise<void>((resolve) => {
    chunk.open = resolve;
  });
  chunk.loaded = new Promise<void>((resolve) => {
    chunk.markLoaded = resolve;
  });
});
afterEach(async () => {
  cleanup();
  // A chunk still loading on a slow machine belongs to this test: it finishes before the next test replaces the gate.
  chunk.open();
  await chunk.loaded;
});

const view = () =>
  render(
    <AnnouncerProvider>
      <MemoryRouter initialEntries={["/"]}>
        <nav>
          <Link to="/b">Zweite</Link>
          <a href="#weiter">Weiter</a>
        </nav>
        <main id="inhalt" tabIndex={-1}>
          <RouteFocus titleOf={() => "Titel"} />
          <Routes>
            <Route path="/" element={<h1>Erste Seite</h1>} />
            <Route path="/b" element={<h1>Zweite Seite</h1>} />
          </Routes>
        </main>
      </MemoryRouter>
    </AnnouncerProvider>,
  );

/**
 * Lets the chunk load and waits until RouteFocus has received it. The steps after that are promise steps only, so one
 * timer tick after the load runs them all: the wait follows the load, not the speed of the machine.
 */
async function loadChunk() {
  chunk.open();
  await chunk.loaded;
  await new Promise((r) => setTimeout(r, 0));
}

describe("US-QS-08 · RouteFocus with its chunk still loading (issue 1362)", () => {
  it("US-QS-08 a key press before the chunk has loaded keeps the focus where the person put it", async () => {
    view();
    await userEvent.click(screen.getByRole("link", { name: "Zweite" }));
    await screen.findByRole("heading", { name: "Zweite Seite" });
    await userEvent.keyboard("{Tab}");
    const focused = document.activeElement;
    await loadChunk();
    expect(document.activeElement).toBe(focused);
    expect(document.activeElement?.tagName).not.toBe("H1");
  });

  it("US-QS-09 without a key press the heading still takes the focus once the chunk has loaded", async () => {
    view();
    await userEvent.click(screen.getByRole("link", { name: "Zweite" }));
    const heading = await screen.findByRole("heading", { name: "Zweite Seite" });
    chunk.open();
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});
