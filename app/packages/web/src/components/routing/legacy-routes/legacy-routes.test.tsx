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

  it("US-QS-14 the former Pokédex address still opens the species mode of the Sammlung", () => {
    open("/pokedex/abc");
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=species false");
  });
});
