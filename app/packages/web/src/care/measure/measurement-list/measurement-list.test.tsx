// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { MeasurementRow } from "@pflanzendex/core";
import { afterEach, describe, expect, it } from "vitest";
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
    <MeasurementList
      measurements={[row("b", "2026-01-01", 40), row("a", "2025-01-01", 10)]}
      photo={{ api: "http://api", token: async () => "t", specimenId: "e1" }}
      onPhotoSaved={() => {}}
      onAdd={() => {}}
      records={records}
    />,
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
