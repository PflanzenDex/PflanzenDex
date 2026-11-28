// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { MeasurementRow } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { MeasurementList } from "./measurement-list";

afterEach(cleanup);
const row = (id: string, date: string, value: number): MeasurementRow => ({
  id,
  specimenId: "e1",
  date,
  value,
  quality: "healthy",
  note: null,
  ratedBy: "keeper",
  photo: null,
});
const list = (records?: ReadonlySet<string>) =>
  render(
    <MemoryRouter>
      <MeasurementList
        measurements={[row("b", "2026-01-01", 40), row("a", "2025-01-01", 10)]}
        photo={{ api: "http://api", token: async () => "t", specimenId: "e1" }}
        onPhotoSaved={() => {}}
        records={records}
      />
    </MemoryRouter>,
  );

describe("US-ACH-05 personal record in the history of a specimen", () => {
  it("US-ACH-05 marks the measurement that set a record, with text, and no other", () => {
    list(new Set(["b"]));
    expect(screen.getAllByText(/Persönlicher Rekord/)).toHaveLength(1);
  });

  it("US-ACH-08 without records (calm mode, read error, none yet) no mark shows", () => {
    list(undefined);
    expect(screen.queryByText(/Persönlicher Rekord/)).toBeNull();
  });
});

describe("US-QS-15 SG-TYPE-05 the title of a measurement breaks only between its parts (issue 2640)", () => {
  it("US-QS-15 at 360 px the value and the date are one part each, and the text of the title is the same", () => {
    setViewportWidth(360);
    list();
    const title = screen.getAllByRole("heading", { level: 3 })[0] as HTMLElement;
    const parts = Array.from(title.querySelectorAll<HTMLElement>("[data-meta-part]"));
    expect(parts.map((p) => plain(p.textContent))).toEqual(["40 cm ·", "01.01.2026"]);
    for (const part of parts)
      expect(part.className.split(" ")).toEqual(
        expect.arrayContaining(["inline-block", "max-w-full", "align-top"]),
      );
    expect(plain(title.textContent)).toBe("40 cm · 01.01.2026");
  });
});
