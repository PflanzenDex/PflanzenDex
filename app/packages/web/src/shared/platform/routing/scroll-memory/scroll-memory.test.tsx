// @vitest-environment jsdom
// Issue 1655 (US-QS-14, NFR-13): Back returns to the place the person had scrolled to. The scroller is `main` or the
// filling view inside it, not the document, so the browser's own restoration does not apply. jsdom has no layout: the
// scroll offset of `main` is a plain value here, and the test moves it like a scroll would.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
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

  it("US-QS-15 · SG-NAV-02 a list scrolled in its own box is at its place again after Back, and the address holds no position", async () => {
    function Where() {
      return <span data-testid="address">{useLocation().search}</span>;
    }
    render(
      <MemoryRouter initialEntries={["/collection"]}>
        <main id="inhalt">
          <ScrollMemory />
          <Routes>
            <Route
              path="/collection"
              element={
                <>
                  <ul aria-label="Pflanzen" data-scroll-region="">
                    <li>Pflanze 1</li>
                  </ul>
                  <Link to="/account">Konto</Link>
                </>
              }
            />
            <Route path="/account" element={<Back />} />
          </Routes>
        </main>
        <Where />
      </MemoryRouter>,
    );
    const box = screen.getByRole("list", { name: "Pflanzen" });
    const scrollTo = scrollable(box);
    scrollTo(180);
    act(() => screen.getByRole("link", { name: "Konto" }).click());
    await screen.findByRole("button", { name: "Zurück" });
    act(() => screen.getByRole("button", { name: "Zurück" }).click());
    const again = await screen.findByRole("list", { name: "Pflanzen" });
    // The list mounts again as a new element: its box starts at the top and is put back (no `?from=` for it).
    scrollable(again);
    await waitFor(() => expect(again.scrollTop).toBe(180));
    expect(screen.getByTestId("address").textContent).toBe("");
  });

  it("US-QS-15 · SG-NAV-02 a list of a new visit (not Back) starts at the top", async () => {
    render(
      <MemoryRouter initialEntries={["/collection"]}>
        <main id="inhalt">
          <ScrollMemory />
          <Routes>
            <Route
              path="/collection"
              element={
                <>
                  <ul aria-label="Pflanzen" data-scroll-region="">
                    <li>Pflanze 1</li>
                  </ul>
                  <Link to="/account">Konto</Link>
                </>
              }
            />
            <Route path="/account" element={<Link to="/collection">Sammlung</Link>} />
          </Routes>
        </main>
      </MemoryRouter>,
    );
    scrollable(screen.getByRole("list", { name: "Pflanzen" }))(180);
    act(() => screen.getByRole("link", { name: "Konto" }).click());
    act(() => screen.getByRole("link", { name: "Sammlung" }).click());
    const fresh = await screen.findByRole("list", { name: "Pflanzen" });
    scrollable(fresh);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fresh.scrollTop).toBe(0);
  });
});
