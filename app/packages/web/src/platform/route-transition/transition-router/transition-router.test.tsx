// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/platform/announcer/announcer";
import { RouteFocus } from "@/components/routing/route-focus/route-focus";
import { TransitionRouter } from "./transition-router";

const doc = document as unknown as { startViewTransition?: unknown };
afterEach(() => {
  cleanup();
  delete doc.startViewTransition;
  window.history.replaceState(null, "", "/");
});

function app() {
  return render(
    <AnnouncerProvider>
      <TransitionRouter>
        <Link to="/b">Zweite</Link>
        <main id="inhalt" tabIndex={-1}>
          <RouteFocus titleOf={(p) => `Seite ${p} – PflanzenDéx`} />
          <Routes>
            <Route path="/" element={<h1>Erste Seite</h1>} />
            <Route path="/b" element={<h1>Zweite Seite</h1>} />
          </Routes>
        </main>
      </TransitionRouter>
    </AnnouncerProvider>,
  );
}

describe("US-QS-14 · TransitionRouter keeps focus and announcements", () => {
  it("US-QS-14 inside a view transition the heading still takes the focus and the title is announced", async () => {
    const started = vi.fn((update: () => Promise<void>) => {
      void update();
      return { finished: Promise.resolve() };
    });
    doc.startViewTransition = started;
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    app();
    // The transition code loads lazily; give it a tick, as the first paint does in the app.
    await new Promise((r) => setTimeout(r, 50));
    await userEvent.click(screen.getByRole("link", { name: "Zweite" }));
    const heading = await screen.findByRole("heading", { name: "Zweite Seite" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await waitFor(() =>
      expect(document.querySelector("[aria-live=polite]")?.textContent).toBe(
        "Seite /b – PflanzenDéx",
      ),
    );
    expect(started).toHaveBeenCalledOnce();
  });

  it("US-QS-14 without browser support the view changes as before, focus and announcement included", async () => {
    app();
    await new Promise((r) => setTimeout(r, 50));
    await userEvent.click(screen.getByRole("link", { name: "Zweite" }));
    const heading = await screen.findByRole("heading", { name: "Zweite Seite" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.title).toBe("Seite /b – PflanzenDéx");
  });
});
