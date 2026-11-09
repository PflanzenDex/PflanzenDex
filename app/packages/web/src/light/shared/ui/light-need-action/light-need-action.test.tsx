// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { LightNeedAction } from "./light-need-action";

afterEach(cleanup);

/** The care profile in miniature: the next step and the zone choice it moves the focus to. */
function ZoneChoiceNextStep() {
  const zone = useRef<HTMLSelectElement | null>(null);
  return (
    <MemoryRouter>
      <LightNeedAction
        speciesId="sp7"
        speciesName="Monstera"
        onChoose={() => zone.current?.focus()}
      />
      <select ref={zone} aria-label="Lichtzone">
        <option value="">Katalog gilt</option>
      </select>
    </MemoryRouter>
  );
}

describe("US-LIC-01 the next step of an unknown light need (P-09)", () => {
  it("US-LIC-01: Given an unknown lux need, when the next step is shown, then it links to the care profile of the species at the zone choice", () => {
    render(
      <MemoryRouter>
        <LightNeedAction speciesId="sp7" speciesName="Monstera" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Lichtbedarf eintragen für „Monstera“" });
    expect(link.textContent).toBe("Lichtbedarf eintragen");
    expect(link.getAttribute("href")).toBe("/discover/species/sp7?sheet=care");
  });

  it("US-LIC-01: Given the inline variant in a line of text, when it is shown, then it is a text link with the species name", () => {
    render(
      <MemoryRouter>
        <LightNeedAction speciesId="sp7" speciesName="Monstera" inline />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Lichtbedarf eintragen für „Monstera“" });
    expect(link.textContent).toBe("Lichtbedarf eintragen");
    expect(link.getAttribute("href")).toBe("/discover/species/sp7?sheet=care");
  });

  it("US-LIC-01: Given the zone choice on the same page, when the next step is used, then the focus moves to the zone choice", async () => {
    render(<ZoneChoiceNextStep />);
    await userEvent.click(
      screen.getByRole("button", { name: "Lichtbedarf eintragen für „Monstera“" }),
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Lichtzone"));
  });
});
