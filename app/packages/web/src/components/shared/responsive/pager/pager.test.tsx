// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { Pager } from "./pager";

afterEach(cleanup);

const items = Array.from({ length: 7 }, (_, i) => `Pflanze ${i + 1}`);

function Where() {
  const { search } = useLocation();
  return <span data-testid="address">{search}</span>;
}

function Example({ at = "/", resetKey = "a" }: { at?: string; resetKey?: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Pager
        items={items}
        pageSize={3}
        label="Pflanzen"
        resetKey={resetKey}
        renderItem={(t) => t}
      />
      <Where />
    </MemoryRouter>
  );
}

function swipe(target: Element, from: number, to: number) {
  fireEvent.pointerDown(target, { clientX: from, clientY: 100 });
  fireEvent.pointerUp(target, { clientX: to, clientY: 100 });
}

describe("Pager (US-QS-15)", () => {
  it("US-QS-15 shows whole entries of the page named in the address and the position", () => {
    render(<Example at="/?page=2" />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Pflanze 4",
      "Pflanze 5",
      "Pflanze 6",
    ]);
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 3");
  });

  it("US-QS-15 a page outside the range shows the nearest valid one and corrects the address", () => {
    render(<Example at="/?page=99" />);
    expect(screen.getByRole("status").textContent).toBe("Seite 3 von 3");
    expect(screen.getByTestId("address").textContent).toBe("?page=3");
  });

  it("US-QS-15 Weiter and Zurück change the page and are disabled at the ends", async () => {
    render(<Example />);
    const back = screen.getByRole("button", { name: "Zurück" });
    expect((back as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 3");
    expect(screen.getByTestId("address").textContent).toBe("?page=2");
    await userEvent.click(back);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
  });

  it("US-QS-15 announces the position politely", () => {
    render(<Example />);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("US-QS-15 a changed filter starts at page 1", () => {
    const { rerender } = render(<Example at="/?page=3" />);
    expect(screen.getByRole("status").textContent).toBe("Seite 3 von 3");
    rerender(<Example at="/?page=3" resetKey="b" />);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
  });

  it("US-QS-15 swiping left goes on, swiping right goes back, a short move does nothing", () => {
    render(<Example />);
    const list = screen.getByRole("list", { name: "Pflanzen" });
    swipe(list, 200, 190);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
    swipe(list, 200, 100);
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 3");
    swipe(list, 100, 200);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
  });

  it("US-QS-15 one page shows no controls", () => {
    render(
      <MemoryRouter>
        <Pager items={["a"]} pageSize={3} label="Pflanzen" renderItem={(t) => t} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-23 a pager with its own address part leaves the page of the list behind it alone", async () => {
    render(
      <MemoryRouter initialEntries={["/?page=2"]}>
        <Pager items={items} pageSize={3} label="Verlauf" param="verlauf" renderItem={(t) => t} />
        <Where />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByTestId("address").textContent).toBe("?page=2&verlauf=2");
  });
});

describe("Pager in a layer (US-QS-22)", () => {
  it("US-QS-22 a list in a layer keeps its page in its own address part, apart from the page of the screen", async () => {
    render(
      <MemoryRouter initialEntries={["/?page=2"]}>
        <Pager items={items} pageSize={3} label="Pflanzen" renderItem={(t) => t} />
        <Pager items={items} pageSize={3} label="Im Layer" param="lpage" renderItem={(t) => t} />
        <Where />
      </MemoryRouter>,
    );
    const layerList = screen.getByRole("list", { name: "Im Layer" });
    // The layer starts at its first page although the screen behind stands on page 2.
    expect(layerList.textContent).toContain("Pflanze 1");
    await userEvent.click(screen.getAllByRole("button", { name: "Weiter" })[1] as HTMLElement);
    expect(screen.getByTestId("address").textContent).toBe("?page=2&lpage=2");
    expect(screen.getByRole("list", { name: "Im Layer" }).textContent).toContain("Pflanze 4");
    expect(screen.getByRole("list", { name: "Pflanzen" }).textContent).toContain("Pflanze 4");
  });
});
