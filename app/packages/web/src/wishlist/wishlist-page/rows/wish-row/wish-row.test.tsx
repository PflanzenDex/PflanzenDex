// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Candidate } from "@pflanzendex/core";
import { WishRow } from "./wish-row";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const wish = {
  id: "w1",
  name: "Aloe vera",
  german: "Aloe",
  title: "Aloe (Aloe vera)",
  zoneText: "Zone 2 · 3 Pflanzen",
  difficulty: null,
  priority: { kind: "thinnest" },
  image: null,
} as unknown as Candidate;

const noPhoto = { api: "http://api", token: async () => "tok" };

/** Shows the address the row leads to, so a test can see that the wish's layer opened. */
function Where() {
  const at = useLocation();
  return <output data-testid="where">{at.search}</output>;
}

function show(c: Candidate = wish, handlers: { onBuy?: () => void; onDiscard?: () => void } = {}) {
  return render(
    <MemoryRouter initialEntries={["/collection?view=wishlist"]}>
      <WishRow
        c={c}
        rank={1}
        onBuy={handlers.onBuy ?? vi.fn()}
        onDiscard={handlers.onDiscard ?? vi.fn()}
        busy={false}
        access={noPhoto}
      />
      <Where />
    </MemoryRouter>,
  );
}

describe("US-QS-22 a compact wish row (issue 1045)", () => {
  it("US-QS-22 the row stays on one line: no wrapping of the actions below the wish", () => {
    const { container } = show();
    expect(container.querySelector("[data-priority]")?.className).not.toContain("flex-wrap");
  });

  it("US-QS-22 · P-08 an unknown difficulty is labelled, not a bare unbekannt", () => {
    show();
    const open = screen.getByRole("button", { name: /^1\. Aloe/ });
    expect(open.textContent).toContain("Schwierigkeit: unbekannt");
    expect(open.textContent).toContain("Zone 2 · 3 Pflanzen");
    expect(open.textContent).not.toContain("—");
  });
});

describe("US-QS-32 the wish row is one object row (FX-35, SG-LIST-03)", () => {
  it("US-QS-32 the wish is one row with a 56 px thumbnail box; Gekauft and Verwerfen stand beside the row", () => {
    const { container } = show();
    expect(container.querySelector('[class~="size-[56px]"] svg')).not.toBeNull();
    const open = screen.getByRole("button", { name: /^1\. Aloe/ });
    // The row's own button is the first button of the row; the actions follow it.
    const buttons = within(container).getAllByRole("button");
    expect(buttons[0]).toBe(open);
    expect(
      within(container).getByRole("button", { name: "Gekauft: Aloe (Aloe vera)" }),
    ).toBeTruthy();
    expect(
      within(container).getByRole("button", { name: "Verwerfen: Aloe (Aloe vera)" }),
    ).toBeTruthy();
  });

  it("US-QS-32 choosing the row opens the wish's layer and says so (aria-haspopup, aria-expanded)", async () => {
    show();
    const row = screen.getByRole("button", { name: /^1\. Aloe/ });
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(row);
    expect(screen.getByTestId("where").textContent).toContain("sheet=wish-w1");
  });

  it("US-QS-32 a wish without a stored picture asks for no picture and shows the drawn placeholder", () => {
    const fetchFn = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchFn);
    const { container } = show({
      ...wish,
      image: {
        url: "https://upload.example/a.jpg",
        source: "Wikimedia Commons",
        license: null,
        stored: false,
      },
    } as unknown as Candidate);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(container.querySelector('[class~="size-[56px]"] svg')).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("US-QS-32 a wish with a stored picture asks its thumbnail from /wishes/<id>/image and shows the picture", async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        requested.push(String(url));
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob([new Uint8Array([1])]),
        } as Response;
      }),
    );
    URL.createObjectURL = vi.fn(() => "blob:wish");
    const { container } = show({
      ...wish,
      image: {
        url: "https://upload.example/a.jpg",
        source: "Wikimedia Commons",
        license: "CC0",
        stored: true,
      },
    } as unknown as Candidate);
    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:wish"),
    );
    expect(requested).toEqual(["http://api/wishes/w1/image?size=thumb"]);
  });
});

describe("US-QS-32 the wish row names a species the SG-TYPE-08 way (F-0067)", () => {
  it("US-QS-32 the row leads with the German name, upright; the scientific name is italic on the meta line", () => {
    const { container } = show();
    const title = within(container).getByText("1. Aloe");
    expect(title.querySelector("i")).toBeNull();
    const latin = within(container).getByText("Aloe vera");
    expect(latin.tagName).toBe("I");
    expect(latin.parentElement?.textContent).toBe(
      "Aloe vera · Zone 2 · 3 Pflanzen · Schwierigkeit: unbekannt",
    );
  });

  it("US-QS-32 a wish without a German name shows its scientific name once, italic, and no doubled name", () => {
    const { container } = show({ ...wish, german: null, title: "Aloe vera" } as Candidate);
    expect(within(container).getAllByText("Aloe vera")).toHaveLength(1);
    expect(within(container).getByText("Aloe vera").tagName).toBe("I");
    expect(container.textContent).not.toContain("Aloe vera (Aloe vera)");
  });

  it("US-QS-32 a German name equal to the scientific name is not a second name in the row (F-0067)", () => {
    const { container } = show({
      ...wish,
      name: "Monstera adansonii",
      german: "Monstera adansonii",
      title: "Monstera adansonii",
    } as Candidate);
    expect(container.textContent).not.toContain("Monstera adansonii Monstera adansonii");
    expect(within(container).getAllByText("Monstera adansonii")).toHaveLength(1);
  });
});

describe("US-QS-32 the wish row's name reads in the order it shows (WCAG 2.5.3, F-0067)", () => {
  it("US-QS-32 the row's name is its visible text: the German name, the scientific name, then the zone and the difficulty", () => {
    show();
    const row = screen.getByRole("button", { name: /^1\. Aloe/ });
    expect(row.hasAttribute("aria-label")).toBe(false);
    expect(row.textContent).toBe(
      "1. Aloe Aloe vera · Zone 2 · 3 Pflanzen · Schwierigkeit: unbekannt",
    );
  });

  it("US-QS-32 without a German name the row's name names the scientific name once", () => {
    show({ ...wish, german: null, title: "Aloe vera" } as Candidate);
    const row = screen.getByRole("button", { name: /^1\. Aloe vera/ });
    expect(row.textContent).toBe("1. Aloe vera Zone 2 · 3 Pflanzen · Schwierigkeit: unbekannt");
  });
});

describe("US-WUN-03 · US-WUN-05 the actions of the row still work", () => {
  it("US-WUN-03 'Gekauft' on the row buys the wish", async () => {
    const onBuy = vi.fn();
    show(wish, { onBuy });
    await userEvent.click(screen.getByRole("button", { name: "Gekauft: Aloe (Aloe vera)" }));
    expect(onBuy).toHaveBeenCalledWith(wish);
  });

  it("US-WUN-05 'Verwerfen' on the row asks first, and only the confirmation discards", async () => {
    const onDiscard = vi.fn();
    show(wish, { onDiscard });
    await userEvent.click(screen.getByRole("button", { name: "Verwerfen: Aloe (Aloe vera)" }));
    expect(onDiscard).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Ja, verwerfen: Aloe (Aloe vera)" }));
    expect(onDiscard).toHaveBeenCalledWith(wish);
  });
});

describe("US-WUN-05 · US-QS-32 the question of 'Verwerfen' has the row's width", () => {
  it("US-WUN-05 · US-QS-32 the question opens below the row, not in its action slot, where it would be clipped", async () => {
    const { container } = show();
    await userEvent.click(screen.getByRole("button", { name: "Verwerfen: Aloe (Aloe vera)" }));
    const question = screen.getByText(/Wirklich verwerfen\?/);
    expect(question.closest(".shrink-0")).toBeNull();
    expect(question.closest("[data-priority]")).toBe(container.querySelector("[data-priority]"));
    // While it asks, the row keeps "Gekauft" and no second "Verwerfen" beside it.
    expect(screen.queryByRole("button", { name: "Verwerfen: Aloe (Aloe vera)" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("button", { name: "Verwerfen: Aloe (Aloe vera)" })).toBeTruthy();
  });
});
