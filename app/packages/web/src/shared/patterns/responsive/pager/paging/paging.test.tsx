// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pager } from "../pager";

afterEach(cleanup);

const plants = Array.from({ length: 6 }, (_, i) => `Pflanze ${i + 1}`);

function Paged(props: { loaded: number; failure?: string; plain?: boolean }) {
  return (
    <MemoryRouter initialEntries={["/?page=2"]}>
      <Pager
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
    </MemoryRouter>
  );
}

describe("FR-BES-23 the focus after a retry of a further page (issue 1304)", () => {
  it("FR-BES-23 a retry that worked moves the focus to the first plant of the page, not to nowhere", async () => {
    const view = render(<Paged loaded={3} failure="Fehlgeschlagen." />);
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    view.rerender(<Paged loaded={6} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pflanze 4" }));
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
