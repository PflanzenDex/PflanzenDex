// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { BrowserRouter, MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { LayerScope } from "@/shared/ui/layer-scope";
import { ScrollEntries } from "./scroll-entries";

afterEach(() => {
  cleanup();
  setViewportWidth(360);
  window.history.replaceState(null, "", "/");
});

const plants = Array.from({ length: 12 }, (_, i) => `Pflanze ${i + 1}`);

function list() {
  return <ScrollEntries items={plants} pageSize={4} label="Pflanzen" renderItem={(t) => t} />;
}

/** Writes the address and the history state the way the router keeps them (`usr` holds the state of the entry). */
function open(url: string, usr: unknown = null) {
  window.history.replaceState({ usr, key: "start", idx: 0 }, "", url);
}

describe("US-QS-15 · SG-LIST-01 · SG-NAV-02 an old address loses its position parts", () => {
  it("US-QS-15 · SG-LIST-01 a list opened at ?from=24&page=3&x=1 ends at ?x=1 without a new history entry", () => {
    setViewportWidth(360);
    open("/pflanzen?from=24&page=3&x=1");
    const entries = window.history.length;
    render(<BrowserRouter>{list()}</BrowserRouter>);
    expect(window.location.search).toBe("?x=1");
    expect(window.location.pathname).toBe("/pflanzen");
    expect(window.history.length).toBe(entries);
    // The list starts at its first entry: every loaded entry is there, nothing is cut into pages.
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });

  it("US-QS-15 · SG-LIST-01 every part of a list is stripped, the new and the old name, and the other parts stay", () => {
    setViewportWidth(360);
    open("/x?lfrom=2&vfrom=3&blfrom=4&verlauf=2&offen=1&erledigt=1&rpage=2&part=wohnzimmer");
    render(<BrowserRouter>{list()}</BrowserRouter>);
    expect(window.location.search).toBe("?part=wohnzimmer");
  });

  it("US-QS-15 · SG-LIST-01 with a layer open every position part goes too: a list in a layer holds no position either (issue 2418)", () => {
    setViewportWidth(1024);
    open("/x?sheet=plant-e1&tab=pflege&ofrom=2&lfrom=4&from=9&page=2");
    render(<BrowserRouter>{list()}</BrowserRouter>);
    expect(window.location.search).toBe("?sheet=plant-e1&tab=pflege");
  });

  it("US-QS-15 · SG-LIST-01 the history state stays, so a layer still closes by going back", () => {
    setViewportWidth(360);
    open("/x?from=24", { layer: "open" });
    render(<BrowserRouter>{list()}</BrowserRouter>);
    expect(window.location.search).toBe("");
    expect((window.history.state as { usr: unknown }).usr).toEqual({ layer: "open" });
  });

  it("US-QS-15 · SG-LIST-01 an address without a position part is not touched", () => {
    setViewportWidth(360);
    open("/x?part=a");
    const entries = window.history.length;
    const state = window.history.state as unknown;
    render(<BrowserRouter>{list()}</BrowserRouter>);
    expect(window.location.search).toBe("?part=a");
    expect(window.history.length).toBe(entries);
    expect(window.history.state).toEqual(state);
  });

  it("US-QS-15 · SG-LIST-01 it strips once, when the list appears: a part written later stays", () => {
    setViewportWidth(360);
    let go: ReturnType<typeof useNavigate> | undefined;
    function Probe() {
      go = useNavigate();
      return <p data-testid="search">{useLocation().search}</p>;
    }
    render(
      <MemoryRouter initialEntries={["/x?from=24"]}>
        <Probe />
        {list()}
      </MemoryRouter>,
    );
    expect(screen.getByTestId("search").textContent).toBe("");
    act(() => void go?.("/x?from=5"));
    expect(screen.getByTestId("search").textContent).toBe("?from=5");
  });

  it("US-QS-15 · SG-LIST-01 a list on a page strips the position at a tablet width as on a phone", () => {
    setViewportWidth(768);
    open("/x?from=4&y=2");
    render(<BrowserRouter>{list()}</BrowserRouter>);
    expect(window.location.search).toBe("?y=2");
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });

  it("US-QS-15 · SG-LIST-01 the list of a layer is one scroll list that strips the position as well (issue 2418)", () => {
    setViewportWidth(768);
    open("/x?lfrom=4&y=1");
    render(
      <BrowserRouter>
        <LayerScope.Provider value>{list()}</LayerScope.Provider>
      </BrowserRouter>,
    );
    expect(window.location.search).toBe("?y=1");
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });
});
