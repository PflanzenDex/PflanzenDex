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
});
