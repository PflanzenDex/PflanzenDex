// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigationType } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { Entry } from "./entry";
import { plain } from "@/shared/testing/plain-text";

afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());

const locations: LightLocation[] = [
  { id: "s1", name: "Regal Süd", lightZoneId: null, kind: "indoor" },
  { id: "s2", name: "Keller", lightZoneId: null, kind: "indoor" },
];
const row = (extra: Partial<PhasesRow> = {}): PhasesRow => ({
  specimenId: "e1",
  name: "Bogenhanf",
  marker: null,
  speciesName: "Bogenhanf",
  speciesId: "a1",
  phase: "dormancy",
  locationId: "s1",
  targetLocationId: null,
  nextChange: { date: "2027-03-16", phase: "growth", days: 120 },
  photo: null,
  ...extra,
});

/**
 * Shows the address the row leads to, so a test can see that the plant's layer opened (US-QS-19), and how the address
 * changed: `data-navigation` is PUSH for a new entry, REPLACE for a tab change (US-QS-32, issue 2150).
 */
function Where() {
  const at = useLocation();
  const how = useNavigationType();
  return (
    <output data-testid="where" data-navigation={how}>
      {at.search}
    </output>
  );
}

const access = { api: "http://api", token: async () => "tok" };

describe("US-QS-32 a phase row opens its plant the way the list 'Alle' does (SG-TOUCH-02)", () => {
  it("US-QS-32 a tap on the row sets the plant's layer in the address", async () => {
    render(
      <MemoryRouter initialEntries={["/collection?view=plants&group=phase"]}>
        <Entry
          bare
          row={row()}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
        <Where />
      </MemoryRouter>,
    );
    const opener = screen.getByRole("button", { name: /^Bogenhanf(\s|$)/ });
    expect(opener.getAttribute("aria-haspopup")).toBe("dialog");
    await userEvent.click(opener);
    expect(screen.getByTestId("where").textContent).toContain("sheet=plant-e1");
  });

  it("US-QS-32 · issue 2355 the row that opens the plant's layer shows the chevron, and a row that opens nothing shows none", () => {
    const { rerender } = render(
      <MemoryRouter>
        <Entry
          bare
          row={row()}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    const opener = screen.getByRole("button", { name: /^Bogenhanf(\s|$)/ });
    const icon = opener.querySelector("svg.lucide-chevron-right");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    rerender(
      <MemoryRouter>
        <Entry
          bare
          opens={false}
          row={row()}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /^Bogenhanf(\s|$)/ })).toBeNull();
    expect(document.querySelector("svg.lucide-chevron-right")).toBeNull();
  });

  it("US-QS-32 · issue 2355 a phase row with its own trailing badge or its switch action shows no chevron", () => {
    const { rerender } = render(
      <MemoryRouter>
        <Entry
          bare
          row={row({ locationId: "s1", targetLocationId: "s2" })}
          locations={locations}
          busy={false}
          onConfirm={() => undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    expect(
      screen
        .getByRole("button", { name: /^Bogenhanf(\s|$)/ })
        .querySelector("svg.lucide-chevron-right"),
    ).toBeNull();
    rerender(
      <MemoryRouter>
        <Entry
          bare
          row={row({ locationId: "s2", targetLocationId: "s1" })}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    expect(
      screen
        .getByRole("button", { name: /^Bogenhanf(\s|$)/ })
        .querySelector("svg.lucide-chevron-right"),
    ).toBeNull();
  });

  it("US-QS-32 the switch is a button beside the row, never inside it, and it names its plant", () => {
    render(
      <MemoryRouter>
        <Entry
          bare
          row={row({ locationId: "s1", targetLocationId: "s2" })}
          locations={locations}
          busy={false}
          onConfirm={() => undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    const opener = screen.getByRole("button", { name: /^Bogenhanf(\s|$)/ });
    expect(within(opener).queryByRole("button")).toBeNull();
    expect(screen.getByRole("button", { name: "Umstellen: Bogenhanf" })).toBeTruthy();
  });

  it("US-QS-32 a phase row shows the plant's own name as the title and the change in the one meta line", () => {
    render(
      <MemoryRouter>
        <Entry
          bare
          row={row({ name: "Bogenhanf – Ableger", marker: "Ableger" })}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    const opener = screen.getByRole("button", { name: /^Ableger(\s|$)/ });
    expect(plain(opener.querySelector("[data-row-meta]")?.textContent)).toBe(
      "Bogenhanf · Nächster Wechsel zur Wachstumsphase: 16.03.2027",
    );
  });
});

describe("US-QS-32 (issue 2150) a phase row without a location says 'Kein Standort' and offers 'Standort setzen' beside it", () => {
  const withoutLocation = (extra: Partial<PhasesRow> = {}) => row({ locationId: null, ...extra });

  it("US-QS-32 (issue 2150) a bare row without a location shows 'Kein Standort', no 'Standort fehlt' and no hint about 'Hinweise'", () => {
    render(
      <MemoryRouter>
        <Entry
          bare
          row={withoutLocation()}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Kein Standort")).toBeTruthy();
    expect(screen.queryByText(/Standort fehlt/)).toBeNull();
    expect(screen.queryByText(/Weise der Pflanze unter „Hinweise“/)).toBeNull();
  });

  it("US-QS-32 (issue 2150) the button 'Standort setzen: Bogenhanf' sits in the hint line under the row beside 'Kein Standort', never inside the row's button", () => {
    render(
      <MemoryRouter>
        <Entry
          bare
          row={withoutLocation()}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    const opener = screen.getByRole("button", { name: /^Bogenhanf(\s|$)/ });
    const setter = screen.getByRole("button", { name: "Standort setzen: Bogenhanf" });
    expect(setter.textContent).toBe("Standort setzen");
    expect(within(opener).queryByRole("button")).toBeNull();
    expect(opener.contains(setter)).toBe(false);
    // The hint line: the neutral chip and the action share one line under the row, so the row keeps its full width.
    const line = setter.parentElement as HTMLElement;
    expect(within(line).getByText("Kein Standort")).toBeTruthy();
    expect(within(opener).queryByText("Kein Standort")).toBeNull();
  });

  it("US-QS-32 (issue 2150) a click on 'Standort setzen' opens the plant's layer on its Standort tab in one new entry", async () => {
    render(
      <MemoryRouter initialEntries={["/collection?view=plants&group=phase"]}>
        <Entry
          bare
          row={withoutLocation()}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
        <Where />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Standort setzen: Bogenhanf" }));
    const where = screen.getByTestId("where");
    expect(where.textContent).toContain("sheet=plant-e1");
    expect(where.textContent).toContain("tab=standort");
    expect(where.getAttribute("data-navigation")).toBe("PUSH");
  });

  it("US-QS-32 (issue 2150) with opens false the click sets only tab=standort, replaced, and opens no layer", async () => {
    render(
      <MemoryRouter initialEntries={["/collection?view=plants"]}>
        <Entry
          bare
          opens={false}
          row={withoutLocation()}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
        <Where />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Standort setzen: Bogenhanf" }));
    const where = screen.getByTestId("where");
    expect(where.textContent).toContain("tab=standort");
    expect(where.textContent).not.toContain("sheet=");
    expect(where.getAttribute("data-navigation")).toBe("REPLACE");
  });

  it("US-QS-32 (issue 2150) a row with a location shows no 'Standort setzen'", () => {
    render(
      <MemoryRouter>
        <Entry
          bare
          row={row()}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /^Standort setzen/ })).toBeNull();
    expect(screen.queryByText("Standort setzen")).toBeNull();
  });
});

describe("US-QS-32 a phase row's thumbnail: the drawn placeholder without a photo, the photo once it is asked (SG-PHOTO-02, NFR-12)", () => {
  it("US-QS-32 without a photo the thumbnail is the drawn placeholder in its 56 px box", () => {
    const { container } = render(
      <MemoryRouter>
        <Entry
          bare
          row={row()}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('[class~="size-[56px]"] svg')).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("US-QS-32 with a photo the row asks its thumbnail address and shows the picture it gets back", async () => {
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
    URL.createObjectURL = vi.fn(() => "blob:phase");
    const { container } = render(
      <MemoryRouter>
        <Entry
          bare
          row={row({ photo: { url: "/specimens/e1/measurements/m1/photo" } })}
          locations={locations}
          busy={false}
          onConfirm={undefined}
          access={access}
        />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:phase"),
    );
    expect(requested).toEqual(["http://api/specimens/e1/measurements/m1/photo?size=thumb"]);
  });
});
