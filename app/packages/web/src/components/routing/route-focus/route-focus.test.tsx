// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense, lazy } from "react";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { AnnouncerProvider } from "@/platform/announcer/announcer";
import { RouteFocus } from "./route-focus";

afterEach(() => {
  cleanup();
  document.title = "";
});

const TITLES: Record<string, string> = { "/": "Erste", "/b": "Zweite", "/slow": "Langsame" };
const titleOf = (pathname: string) => `${TITLES[pathname] ?? "Ohne"} – PflanzenDéx`;

/** A page that shows its heading only after it has "loaded", like a lazy page behind a skeleton. */
const Slow = lazy(async () => {
  await new Promise((r) => setTimeout(r, 30));
  return { default: () => <h1>Langsame Seite</h1> };
});

function First() {
  const navigate = useNavigate();
  return (
    <>
      <h1>Erste Seite</h1>
      <button type="button" onClick={() => void navigate("/b")}>
        Öffnen
      </button>
    </>
  );
}

function Second() {
  const navigate = useNavigate();
  return (
    <>
      <h1>Zweite Seite</h1>
      <button type="button" onClick={() => void navigate(-1)}>
        Zurück
      </button>
    </>
  );
}

function Harness() {
  return (
    <>
      <nav>
        <Link to="/">Erste</Link>
        <Link to="/b">Zweite</Link>
        <Link to="/slow">Langsame</Link>
        <Link to="/none">Ohne</Link>
      </nav>
      <main id="inhalt" tabIndex={-1}>
        <RouteFocus titleOf={titleOf} />
        <Suspense fallback={<p>Lädt</p>}>
          <Routes>
            <Route path="/" element={<First />} />
            <Route path="/b" element={<Second />} />
            <Route path="/slow" element={<Slow />} />
            <Route path="/none" element={<p>Ohne Überschrift</p>} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}

const view = () =>
  render(
    <AnnouncerProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Harness />
      </MemoryRouter>
    </AnnouncerProvider>,
  );

describe("US-QS-09 · RouteFocus (2.4.2, 2.4.3)", () => {
  it("US-QS-09 sets the German page title of the view, without stealing the focus on first load", () => {
    view();
    expect(document.title).toBe("Erste – PflanzenDéx");
    expect(document.activeElement).toBe(document.body);
  });

  it("US-QS-09 when the view changes the focus moves to its main heading and the new title is announced", async () => {
    view();
    await userEvent.click(screen.getByRole("link", { name: "Zweite" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Zweite Seite" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.title).toBe("Zweite – PflanzenDéx");
    await waitFor(() =>
      expect(document.querySelector("[aria-live=polite]")?.textContent).toBe(
        "Zweite – PflanzenDéx",
      ),
    );
  });

  it("US-QS-09 keyboard only: Enter on a link moves the focus to the new heading", async () => {
    view();
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Zweite" }));
    await userEvent.keyboard("{Enter}");
    const heading = await screen.findByRole("heading", { name: "Zweite Seite" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("US-QS-09 it waits until a lazy view has loaded before it moves the focus", async () => {
    view();
    await userEvent.click(screen.getByRole("link", { name: "Langsame" }));
    expect(screen.queryByRole("heading", { name: "Langsame Seite" })).toBeNull();
    const heading = await screen.findByRole("heading", { name: "Langsame Seite" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("US-QS-09 going back restores the focus to the element that opened the view (2.4.3)", async () => {
    view();
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Zweite Seite" })),
    );
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));
    // The first view is rendered anew: the opener is found again by what the user sees.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Öffnen" })),
    );
  });

  it("US-QS-09 a view without a heading gets the focus on the main region instead of nowhere", async () => {
    view();
    await userEvent.click(screen.getByRole("link", { name: "Ohne" }));
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("inhalt")), {
      timeout: 4000,
    });
  });

  it("US-QS-09 a key press while it waits keeps the focus where the person put it", async () => {
    view();
    await userEvent.click(screen.getByRole("link", { name: "Langsame" }));
    await userEvent.keyboard("{Tab}");
    const focused = document.activeElement;
    await screen.findByRole("heading", { name: "Langsame Seite" });
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(focused);
  });
});
