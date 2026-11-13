// @vitest-environment jsdom
// Issue 1655 (US-QS-14, NFR-13): Back returns to the place the person had scrolled to. The scroller is `main` or the
// filling view inside it, not the document, so the browser's own restoration does not apply. jsdom has no layout: the
// scroll offset of `main` is a plain value here, and the test moves it like a scroll would.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ScrollMemory } from "./scroll-memory";

afterEach(cleanup);

function Back() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      Zurück
    </button>
  );
}

function Shell() {
  return (
    <main id="inhalt">
      <ScrollMemory />
      <Routes>
        <Route path="/today" element={<Link to="/account">Konto</Link>} />
        <Route path="/account" element={<Back />} />
      </Routes>
    </main>
  );
}

/** Gives `main` a scroll offset that keeps what is set, as a browser does for a tall enough view. */
function scrollable(main: HTMLElement) {
  let top = 0;
  Object.defineProperty(main, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => void (top = value),
  });
  return (value: number) => {
    top = value;
    fireEvent.scroll(main);
  };
}

describe("US-QS-14 Back restores the scroll position of a view (issue 1655)", () => {
  it("US-QS-14 a view scrolled to 320 px is at 320 px again after another destination and Back", async () => {
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <Shell />
      </MemoryRouter>,
    );
    const main = document.getElementById("inhalt");
    if (!main) throw new Error("no main");
    const scrollTo = scrollable(main);
    scrollTo(320);
    act(() => screen.getByRole("link", { name: "Konto" }).click());
    scrollTo(0);
    act(() => screen.getByRole("button", { name: "Zurück" }).click());
    await screen.findByRole("link", { name: "Konto" });
    await waitFor(() => expect(main.scrollTop).toBe(320));
  });

  it("US-QS-14 a new visit of a view (not Back) starts at the top", async () => {
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <Shell />
      </MemoryRouter>,
    );
    const main = document.getElementById("inhalt");
    if (!main) throw new Error("no main");
    const scrollTo = scrollable(main);
    scrollTo(320);
    act(() => screen.getByRole("link", { name: "Konto" }).click());
    scrollTo(0);
    await screen.findByRole("button", { name: "Zurück" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(main.scrollTop).toBe(0);
  });
});
