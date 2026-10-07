// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { legacyRoutes } from "./legacy-routes";

afterEach(cleanup);

function Probe() {
  const l = useLocation();
  const state = l.state as { keepFocus?: boolean } | null;
  return (
    <p data-testid="address">{`${l.pathname}${l.search}${l.hash} ${state?.keepFocus === true}`}</p>
  );
}

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {legacyRoutes()}
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );

describe("US-QS-14 old addresses keep working", () => {
  it("US-QS-14 · US-BEH-02 /treatments leads to the section Behandlungen of Heute and keeps the focus handling to the section", () => {
    open("/treatments");
    expect(screen.getByTestId("address").textContent).toBe("/today#behandlungen true");
  });

  it("US-QS-14 · US-BES-08 /hints leads to the section Fehlt noch of Heute", () => {
    open("/hints");
    expect(screen.getByTestId("address").textContent).toBe("/today#fehlt-noch true");
  });

  it("US-QS-14 · US-ACC-02 /settings leads to the section Einstellungen of Konto and keeps the focus handling to the section", () => {
    open("/settings");
    expect(screen.getByTestId("address").textContent).toBe("/account#einstellungen true");
  });

  it("US-QS-14 · US-WUN-01 /wishlist leads to the wishlist mode of the Sammlung and keeps the focus on the control", () => {
    open("/wishlist");
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=wishlist true");
  });

  it("US-QS-14 · US-BES-05 /difficulty leads to the species mode sorted by difficulty", () => {
    open("/difficulty");
    expect(screen.getByTestId("address").textContent).toBe(
      "/collection?view=species&sort=difficulty true",
    );
  });

  it("US-QS-14 · US-PHA-01 /care-phases leads to the plants grouped by care phase and keeps the focus handling", () => {
    open("/care-phases");
    expect(screen.getByTestId("address").textContent).toBe(
      "/collection?view=plants&group=phase true",
    );
  });

  it("US-QS-14 · US-BES-09 /care-profile leads to the species mode, where a species with its care profile is chosen", () => {
    open("/care-profile");
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=species true");
  });

  it("US-QS-14 · US-LIC-01 /light leads to the plants with the management of the locations open", () => {
    open("/light");
    expect(screen.getByTestId("address").textContent).toBe(
      "/collection?view=plants&manage=locations true",
    );
  });

  it("US-QS-14 the former Pokédex address still opens the species mode of the Sammlung", () => {
    open("/pokedex/abc");
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=species false");
  });

  it("US-QS-14 · US-BES-01 /species leads to the catalog mode of Entdecken and keeps the focus on the control", () => {
    open("/species");
    expect(screen.getByTestId("address").textContent).toBe("/discover?view=catalog true");
  });

  it("US-QS-14 · US-POK-09 /species/:id leads to the same profile below Entdecken", () => {
    open("/species/a%201");
    expect(screen.getByTestId("address").textContent).toBe("/discover/species/a%201 false");
  });
});
