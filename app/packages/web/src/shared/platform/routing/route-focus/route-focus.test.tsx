// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense, lazy, useEffect } from "react";
import {
  Link,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { PAGER_PARTS, type PagerPart } from "@/shared/patterns/responsive/pager/paging/address";
import { RouteFocus } from "./route-focus";
import { createFocusMover } from "./focus-moves";

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
        <Link to="/?sheet=zones">Mit Ebene</Link>
        <Link to="/?from=6">Mit Seite</Link>
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

describe("US-QS-19 · RouteFocus leaves layers and pages alone (US-QS-15)", () => {
  it("US-QS-19 opening a layer or turning a page does not move the focus to the heading", async () => {
    view();
    const link = screen.getByRole("link", { name: "Erste" });
    link.focus();
    await userEvent.click(screen.getByRole("link", { name: "Mit Ebene" }));
    await userEvent.click(screen.getByRole("link", { name: "Mit Seite" }));
    await new Promise((r) => setTimeout(r, 60));
    expect(document.activeElement).not.toBe(screen.getByRole("heading", { level: 1 }));
    expect(document.title).toBe("Erste – PflanzenDéx");
  });
});

describe("FR-BES-23 · RouteFocus and the first entry of a list (issue 1492)", () => {
  function Convert() {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => void navigate("/?from=6", { replace: true })}>
        Umrechnen
      </button>
    );
  }

  it("FR-BES-23 an old page address converted to its first entry (?page=2 to ?from=6) moves no focus", async () => {
    render(
      <MemoryRouter initialEntries={["/?page=2"]}>
        <AnnouncerProvider>
          <main id="inhalt" tabIndex={-1}>
            <RouteFocus titleOf={titleOf} />
            <h1>Erste Seite</h1>
            <Convert />
          </main>
        </AnnouncerProvider>
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: "Umrechnen" });
    button.focus();
    await userEvent.click(button);
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(button);
  });
});

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

  it("US-QS-08 the tab or part of a layer (?ltab, ?tab, ?teil) is no new view: the focus stays (issue 1315)", async () => {
    function Tabs() {
      const [, setParams] = useSearchParams();
      return (
        <button type="button" onClick={() => setParams({ ltab: "texts", tab: "b", teil: "c" })}>
          Reiter
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={["/b"]}>
        <AnnouncerProvider>
          <main id="inhalt" tabIndex={-1}>
            <RouteFocus titleOf={titleOf} />
            <h1>Zweite Seite</h1>
            <Tabs />
          </main>
        </AnnouncerProvider>
      </MemoryRouter>,
    );
    const tab = screen.getByRole("button", { name: "Reiter" });
    tab.focus();
    await userEvent.click(tab);
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(tab);
  });

  it("US-QS-18 · US-QS-15 opening a layer or turning a page (?sheet, ?from) is no new view: the focus stays", async () => {
    function Opener() {
      const [, setParams] = useSearchParams();
      return (
        <button type="button" onClick={() => setParams({ sheet: "tasks", from: "6" })}>
          Ebene
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={["/b"]}>
        <AnnouncerProvider>
          <main id="inhalt" tabIndex={-1}>
            <RouteFocus titleOf={titleOf} />
            <h1>Zweite Seite</h1>
            <Opener />
          </main>
        </AnnouncerProvider>
      </MemoryRouter>,
    );
    const opener = screen.getByRole("button", { name: "Ebene" });
    await userEvent.click(opener);
    await new Promise((r) => setTimeout(r, 400));
    expect(document.activeElement).toBe(opener);
  });

  it("US-WAC-07 · US-QS-15 turning a page of the leaf log (?blfrom) is no new view: the focus stays", async () => {
    function Turner() {
      const [, setParams] = useSearchParams();
      return (
        <button type="button" onClick={() => setParams({ blfrom: "6" }, { replace: true })}>
          Weiter
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={["/b"]}>
        <AnnouncerProvider>
          <main id="inhalt" tabIndex={-1}>
            <RouteFocus titleOf={titleOf} />
            <h1>Zweite Seite</h1>
            <Turner />
          </main>
        </AnnouncerProvider>
      </MemoryRouter>,
    );
    const turner = screen.getByRole("button", { name: "Weiter" });
    await userEvent.click(turner);
    await new Promise((r) => setTimeout(r, 400));
    expect(document.activeElement).toBe(turner);
  });

  it("US-WAC-07 · US-QS-15 choosing the list of the course (?course) is no new view: the focus stays on the switch", async () => {
    function Chooser() {
      const [, setParams] = useSearchParams();
      return (
        <button type="button" onClick={() => setParams({ course: "leaves" }, { replace: true })}>
          Blätter
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={["/b"]}>
        <AnnouncerProvider>
          <main id="inhalt" tabIndex={-1}>
            <RouteFocus titleOf={titleOf} />
            <h1>Zweite Seite</h1>
            <Chooser />
          </main>
        </AnnouncerProvider>
      </MemoryRouter>,
    );
    const chooser = screen.getByRole("button", { name: "Blätter" });
    await userEvent.click(chooser);
    await new Promise((r) => setTimeout(r, 400));
    expect(document.activeElement).toBe(chooser);
  });
});

/** A view with a pager on `param` (seven entries, three per page): its heading is the view's own. */
function PagedView({ param }: { param: PagerPart }) {
  const entries = Array.from({ length: 7 }, (_, i) => `Eintrag ${i + 1}`);
  return (
    <main id="inhalt" tabIndex={-1}>
      <RouteFocus titleOf={titleOf} />
      <h1>Zweite Seite</h1>
      <Pager items={entries} pageSize={3} label="Liste" param={param} renderItem={(t) => t} />
    </main>
  );
}

describe("US-QS-15 · turning a page of a list is no view change (issue 1550)", () => {
  it("US-QS-15 turning a page of the measurements (?vfrom) keeps the focus on the pager", async () => {
    render(
      <MemoryRouter initialEntries={["/b"]}>
        <AnnouncerProvider>
          <PagedView param="vfrom" />
        </AnnouncerProvider>
      </MemoryRouter>,
    );
    const next = screen.getByRole("button", { name: "Weiter" });
    await userEvent.click(next);
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByText("Seite 2 von 3")).toBeTruthy();
    expect(document.activeElement).toBe(next);
  });

  it("US-QS-15 turning a page of the classification rules (?rfrom) keeps the focus on the pager", async () => {
    render(
      <MemoryRouter initialEntries={["/b"]}>
        <AnnouncerProvider>
          <PagedView param="rfrom" />
        </AnnouncerProvider>
      </MemoryRouter>,
    );
    const next = screen.getByRole("button", { name: "Weiter" });
    await userEvent.click(next);
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByText("Seite 2 von 3")).toBeTruthy();
    expect(document.activeElement).toBe(next);
  });

  it("US-QS-15 turning a page of any list (every address part of PAGER_PARTS) keeps the focus on the pager", async () => {
    for (const part of PAGER_PARTS) {
      const { unmount } = render(
        <MemoryRouter initialEntries={["/b"]}>
          <AnnouncerProvider>
            <PagedView param={part} />
          </AnnouncerProvider>
        </MemoryRouter>,
      );
      const next = screen.getByRole("button", { name: "Weiter" });
      await userEvent.click(next);
      await new Promise((r) => setTimeout(r, 400));
      expect(document.activeElement, `?${part}`).toBe(next);
      unmount();
    }
  }, 20000);
});

/** A view that shows its heading and then redirects to the start view, as a page does after a check. */
function AltView() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate("/b", { replace: true });
  }, [navigate]);
  return <h1>Alt Seite</h1>;
}

function Third() {
  const navigate = useNavigate();
  return (
    <>
      <h1>Dritte Seite</h1>
      <button type="button" onClick={() => void navigate(-1)}>
        Zurück
      </button>
    </>
  );
}

/** The route table as the app has it: `/` and an old address redirect with `<Navigate replace>` (issue 1423). */
function Arrival() {
  return (
    <>
      <a href="#inhalt">Zum Inhalt springen</a>
      <nav>
        <Link to="/dritte">Dritte</Link>
        <Link to="/alt">Alt</Link>
      </nav>
      <main id="inhalt" tabIndex={-1}>
        <RouteFocus titleOf={titleOf} />
        <Suspense fallback={<p>Lädt</p>}>
          <Routes>
            <Route path="/" element={<Navigate to="/b" replace />} />
            <Route path="/b" element={<Second />} />
            <Route path="/alt" element={<AltView />} />
            <Route path="/dritte" element={<Third />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}

const arrive = () =>
  render(
    <AnnouncerProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Arrival />
      </MemoryRouter>
    </AnnouncerProvider>,
  );

describe("US-QS-08 · a first load through a redirect is no view change (issue 1423)", () => {
  it("US-QS-08 the redirect from / on the first load leaves the focus at the top: the first Tab reaches the skip link (2.4.1)", async () => {
    arrive();
    const heading = await screen.findByRole("heading", { level: 1, name: "Zweite Seite" });
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).not.toBe(heading);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Zum Inhalt springen" }));
  });

  it("US-QS-08 after such a first load a view change moves the focus to the heading, and going back restores it (2.4.3)", async () => {
    arrive();
    await screen.findByRole("heading", { level: 1, name: "Zweite Seite" });
    await new Promise((r) => setTimeout(r, 50));
    await userEvent.click(screen.getByRole("link", { name: "Dritte" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 1, name: "Dritte Seite" }),
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("link", { name: "Dritte" })),
    );
  });

  it("US-QS-08 a redirect after the person has navigated still moves the focus to the heading (2.4.3)", async () => {
    arrive();
    await screen.findByRole("heading", { level: 1, name: "Zweite Seite" });
    await new Promise((r) => setTimeout(r, 50));
    await userEvent.click(screen.getByRole("link", { name: "Alt" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Zweite Seite" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});

describe("US-QS-15 · no frame on the heading after navigation (NFR-13)", () => {
  beforeEach(() => document.documentElement.removeAttribute("data-input"));

  it("US-QS-15 after a click the heading takes the focus, and the page is marked as pointer input", async () => {
    view();
    await userEvent.click(screen.getByRole("link", { name: "Zweite" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Zweite Seite" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.documentElement.getAttribute("data-input")).toBe("pointer");
  });

  it("US-QS-15 after a key press the heading takes the focus, and the page is marked as keyboard input", async () => {
    view();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    const heading = await screen.findByRole("heading", { name: "Zweite Seite" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.documentElement.getAttribute("data-input")).toBe("keyboard");
  });
});

describe("US-QS-09 · issue 1097 the heading of a loading skeleton is not the view's heading", () => {
  it("US-QS-09 · issue 1097 the focus waits past the skeleton's h1 and goes to the page's own heading", async () => {
    const main = document.createElement("main");
    main.id = "inhalt";
    main.innerHTML = '<h1 data-route-fallback="">Freunde</h1>';
    document.body.append(main);
    const mover = createFocusMover();
    let done = false;
    mover.move("a", "b", "PUSH", () => {
      done = true;
    });
    expect(done).toBe(false);
    expect(document.activeElement).not.toBe(main.querySelector("h1"));
    main.innerHTML = "<h1>Freunde</h1>";
    await waitFor(() => expect(done).toBe(true));
    expect(document.activeElement).toBe(main.querySelector("h1"));
    mover.dispose();
    main.remove();
  });
});
