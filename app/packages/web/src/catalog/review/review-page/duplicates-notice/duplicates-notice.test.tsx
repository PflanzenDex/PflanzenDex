// @vitest-environment jsdom
import type { ApprovedDuplicate } from "@pflanzendex/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DuplicatesNotice } from "./duplicates-notice";

const NAMES = [
  "Aloe vera",
  "Echeveria elegans",
  "Haworthia fasciata",
  "Crassula ovata",
  "Sansevieria cylindrica",
  "Zamia furfuracea",
];

/** One approved Latin name held by two species, for each name given. */
const groups = (names: readonly string[]): ApprovedDuplicate[] =>
  names.map((latinName, i) => ({
    latinName,
    species: [
      { id: `a${i}`, latinName },
      { id: `b${i}`, latinName },
    ],
  }));

afterEach(cleanup);

describe("US-BES-10 approved Latin names held twice (read-only notice)", () => {
  it("US-BES-10 without approved duplicates no notice is shown", () => {
    const { container } = render(<DuplicatesNotice duplicates={[]} />);
    expect(container.textContent).toBe("");
  });

  it("US-BES-10 one name is named with its singular text and cannot be merged yet", () => {
    render(<DuplicatesNotice duplicates={groups(["Aloe vera"])} />);
    expect(
      screen.getByText(
        "Ein lateinischer Name ist bei mehreren freigegebenen Arten vergeben: Aloe vera.",
        { exact: false },
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Diese Arten lassen sich noch nicht zusammenführen/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US-BES-10 two names are counted and named", () => {
    render(<DuplicatesNotice duplicates={groups(NAMES.slice(0, 2))} />);
    expect(
      screen.getByText(
        /^2 lateinische Namen sind bei mehreren freigegebenen Arten vergeben: Aloe vera, Echeveria elegans\./,
      ),
    ).toBeTruthy();
  });

  it("US-BES-10 a list cut at five names says how many are left out (P-10)", () => {
    const { container } = render(<DuplicatesNotice duplicates={groups(NAMES)} />);
    expect(container.textContent).toContain("6 lateinische Namen");
    expect(container.textContent).toContain("Sansevieria cylindrica und 1 weitere");
    expect(container.textContent).not.toContain("Zamia furfuracea");
  });

  it("US-BES-10 exactly five names are all named, with no 'weitere'", () => {
    const { container } = render(<DuplicatesNotice duplicates={groups(NAMES.slice(0, 5))} />);
    expect(container.textContent).toContain("Sansevieria cylindrica.");
    expect(container.textContent).not.toContain("weitere");
  });
});
