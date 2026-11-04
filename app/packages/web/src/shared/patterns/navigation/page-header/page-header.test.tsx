// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "./page-header";

/** Renders inside a router, because the back control of a page is a link to its address. */
const inRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

afterEach(cleanup);

describe("US-QS-14 · US-QS-15 PageHeader, the one header of a sub-page", () => {
  it("US-QS-14 renders the title as the one h1 of the page", () => {
    inRouter(<PageHeader title="Tauschbörse" />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings.map((h) => h.textContent)).toEqual(["Tauschbörse"]);
  });

  it("US-QS-14 the back link is named after its target and leads to its address", async () => {
    render(
      <MemoryRouter initialEntries={["/friends/exchange"]}>
        <Routes>
          <Route
            path="/friends/exchange"
            element={
              <PageHeader
                title="Tauschbörse"
                back={{ label: "Zurück zu Freunde", to: "/friends" }}
              />
            }
          />
          <Route path="/friends" element={<p>Freunde-Liste</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const back = screen.getByRole("link", { name: "Zurück zu Freunde" });
    expect(back.getAttribute("href")).toBe("/friends");
    await userEvent.click(back);
    expect(screen.getByText("Freunde-Liste")).toBeTruthy();
  });

  it("US-QS-14 the back button has an accessible name and calls back", async () => {
    const onBack = vi.fn();
    render(<PageHeader title="Messen: Aloe" back={{ label: "Zurück zur Sammlung", onBack }} />);
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Sammlung" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("US-QS-14 · DS-15 the back control is a 44 px icon target, not a text pill", () => {
    inRouter(<PageHeader title="Profil" back={{ label: "Zurück zu Konto", to: "/account" }} />);
    const back = screen.getByRole("link", { name: "Zurück zu Konto" });
    expect(back.className).toContain("min-h-[44px]");
    expect(back.className).toContain("min-w-[44px]");
    expect(back.textContent).toBe("");
  });

  it("US-QS-14 the optional action renders beside the title", () => {
    inRouter(<PageHeader title="Freunde" action={<button type="button">Geräte</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Freunde" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Geräte" })).toBeTruthy();
  });

  it("US-QS-14 without a back target the header shows no back control", () => {
    inRouter(<PageHeader title="Prüfliste" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US-QS-14 a section header is a level-2 heading, so the page keeps its one h1 elsewhere", () => {
    inRouter(<PageHeader title="Profil" heading="h2" />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Profil" })).toBeTruthy();
  });

  it("US-QS-15 at a large text size the action wraps below the title instead of squeezing it to nothing", () => {
    inRouter(
      <PageHeader
        title="Tauschbörse"
        action={<button type="button">Zum Tausch anbieten</button>}
      />,
    );
    const row = document.querySelector("[data-page-header]");
    expect(row?.className).toContain("flex-wrap");
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("min-w-min");
    expect(screen.getByRole("button").parentElement?.className).toContain("max-w-full");
  });

  it("NFR-13 with a way back the title keeps 230 px beside the back control, so a narrower row wraps and the back control sits above the title", () => {
    inRouter(
      <PageHeader
        title="Adiantum raddianum"
        back={{ label: "Zurück zur Suche", to: "/discover" }}
      />,
    );
    const row = document.querySelector("[data-page-header]");
    expect(row?.className).toContain("flex-wrap");
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("min-w-[230px]");
    expect(title.className).not.toContain("min-w-20");
    expect(screen.getByRole("link", { name: "Zurück zur Suche" }).className).toContain("shrink-0");
  });

  it("NFR-13 the back control keeps its 44 px target and does not shrink when the title takes the row below it", () => {
    render(
      <PageHeader
        title="Messen: Aloe"
        back={{ label: "Zurück zur Sammlung", onBack: () => undefined }}
      />,
    );
    const back = screen.getByRole("button", { name: "Zurück zur Sammlung" });
    expect(back.className).toContain("shrink-0");
    expect(back.className).toContain("min-h-[44px]");
    expect(back.className).toContain("min-w-[44px]");
  });

  it("NFR-13 with an action no word of the title breaks inside: the title is at least its longest word", () => {
    inRouter(
      <PageHeader
        title="Tauschbörse"
        action={<button type="button">Zum Tausch anbieten</button>}
      />,
    );
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("min-w-min");
    expect(title.className).toContain("[overflow-wrap:normal]");
    expect(title.className).not.toContain("min-w-20");
    expect(title.className).not.toContain("anywhere");
  });

  it("NFR-13 with a way back and an action the title is at least its longest word, so the action wraps under the title (#1177)", () => {
    inRouter(
      <PageHeader
        title="Tauschbörse"
        back={{ label: "Zurück zu Freunde", to: "/friends" }}
        action={<button type="button">Zum Tausch anbieten</button>}
      />,
    );
    expect(document.querySelector("[data-page-header]")?.className).toContain("flex-wrap");
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("min-w-min");
    expect(title.className).not.toContain("min-w-20");
    expect(title.className).not.toContain("min-w-[230px]");
  });

  it("NFR-13 without an action the title keeps the 5 rem minimum and the anywhere wrap, so other headers do not change", () => {
    inRouter(<PageHeader title="Freunde" />);
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("min-w-20");
    expect(title.className).toContain("[overflow-wrap:anywhere]");
    expect(title.className).not.toContain("min-w-min");
  });
});
