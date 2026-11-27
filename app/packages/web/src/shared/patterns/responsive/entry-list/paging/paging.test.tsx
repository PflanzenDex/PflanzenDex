// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollEntries } from "./scroll-entries/scroll-entries";
import { LayerScope } from "@/shared/ui/layer-scope";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { dropPageParts } from "./address";
import { knownCount, type EntriesPaging } from "./paging";

afterEach(cleanup);
// A list in a layer is one scroll list (US-QS-15, SG-LIST-01, issue 2418): these tests pin the focus after a retry there.
beforeEach(() => setViewportWidth(1024));

const plants = Array.from({ length: 6 }, (_, i) => `Pflanze ${i + 1}`);

function Paged(props: { loaded: number; failure?: string; plain?: boolean }) {
  return (
    <MemoryRouter initialEntries={["/?from=3"]}>
      <LayerScope.Provider value>
        <ScrollEntries
          items={plants.slice(0, props.loaded)}
          pageSize={3}
          label="Pflanzen"
          renderItem={(name) => (props.plain ? name : <button type="button">{name}</button>)}
          paging={{
            total: 6,
            loading: false,
            failure: props.failure,
            onMore: vi.fn(),
            onRetry: vi.fn(),
            loadingText: "Pflanzen werden geladen …",
            retryText: "Erneut versuchen",
          }}
        />
      </LayerScope.Provider>
    </MemoryRouter>
  );
}

describe("FR-BES-23 the focus after a retry of a further page (issue 1304)", () => {
  it("FR-BES-23 a retry that worked moves the focus to the first plant of the list, not to nowhere", async () => {
    const view = render(<Paged loaded={3} failure="Fehlgeschlagen." />);
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    view.rerender(<Paged loaded={6} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pflanze 1" }));
  });

  it("FR-BES-23 entries without a control: the focus goes to the list", async () => {
    const view = render(<Paged loaded={3} failure="Fehlgeschlagen." plain />);
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    view.rerender(<Paged loaded={6} plain />);
    expect(document.activeElement).toBe(screen.getByRole("list", { name: "Pflanzen" }));
  });

  it("P-10 a retry that failed again leaves the focus on Erneut versuchen", async () => {
    const view = render(<Paged loaded={3} failure="Fehlgeschlagen." />);
    const retry = screen.getByRole("button", { name: "Erneut versuchen" });
    await userEvent.click(retry);
    view.rerender(<Paged loaded={3} failure="Wieder fehlgeschlagen." />);
    expect(document.activeElement).toBe(retry);
  });

  it("FR-BES-23 entries that arrive without a retry leave the focus alone", () => {
    const view = render(<Paged loaded={3} />);
    view.rerender(<Paged loaded={6} />);
    expect(document.activeElement).toBe(document.body);
  });
});

describe("FR-BES-23 the address parts of a list (issue 1492)", () => {
  it("FR-BES-23 dropping a list's part takes its new and its old name, and no other part", () => {
    const params = new URLSearchParams("page=2&from=3&rpage=4&rfrom=5&keep=1");
    dropPageParts(params, "from", "rfrom");
    expect(params.toString()).toBe("keep=1");
  });
});

describe("US-QS-15 · FR-BES-23 the count of a server list", () => {
  const known = (total?: number): EntriesPaging => ({
    total,
    loading: false,
    onMore: vi.fn(),
    onRetry: vi.fn(),
    loadingText: "",
    retryText: "",
  });

  it("US-QS-15 · FR-BES-23 a known total counts all entries, at least the loaded ones; an unknown total counts the loaded ones", () => {
    expect(knownCount(known(84), 20)).toBe(84);
    expect(knownCount(known(10), 20)).toBe(20);
    expect(knownCount(known(undefined), 20)).toBe(20);
    expect(knownCount(undefined, 7)).toBe(7);
  });
});
