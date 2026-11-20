// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_DISTRIBUTION } from "../../../insights/distribution-test-helpers";
import { ZoneInsightRow, zoneInsightMeta } from "./zone-insight";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

describe("US-QS-32 · the light-zone row of the plants (F-0114, SG-TOUCH-02)", () => {
  it("US-QS-32 the row is one button named by its visible text, with a chevron, and it is at least 44 px high", () => {
    render(wrap(<ZoneInsightRow distribution={EMPTY_DISTRIBUTION.distribution} />));
    const row = screen.getByRole("button", { name: "Lichtzonen" });
    expect(row.querySelector("svg")).not.toBeNull();
    expect(row.className).toContain("min-h-11");
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("US-QS-32 a new account shows the row without a meta line: nothing names a zone it does not have (P-08)", () => {
    expect(zoneInsightMeta(EMPTY_DISTRIBUTION.distribution)).toBeUndefined();
  });

  it("US-QS-32 the meta line names the thinnest zone: 'Zone 4 am leersten'", () => {
    const distribution = {
      ...EMPTY_DISTRIBUTION.distribution,
      thinnest: [{ name: "Zone 4", count: 1 }],
    } as unknown as typeof EMPTY_DISTRIBUTION.distribution;
    render(wrap(<ZoneInsightRow distribution={distribution} />));
    expect(screen.getByRole("button", { name: "Lichtzonen Zone 4 am leersten" })).toBeTruthy();
  });

  it("US-QS-32 the whole row opens the layer 'zones': the row says it is expanded once the layer is open", async () => {
    render(wrap(<ZoneInsightRow distribution={EMPTY_DISTRIBUTION.distribution} />));
    const row = screen.getByRole("button", { name: "Lichtzonen" });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
  });
});
