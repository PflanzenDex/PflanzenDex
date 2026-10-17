// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RequestState } from "./request-state";

afterEach(cleanup);

const props = { onRetry: () => undefined, skeleton: <p role="status">Lädt</p> };

describe("US-QS-09 · RequestState page heading (1.3.1, 2.4.6)", () => {
  it("US-QS-09 a failed page keeps its main heading above the error and the retry", () => {
    render(
      <RequestState {...props} status="error" errorText="Nicht erreichbar." heading="Bestand" />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Bestand" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Nicht erreichbar.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("US-QS-09 without a heading the error adds none, so a section never gets a second h1", () => {
    render(<RequestState {...props} status="error" />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });
});

describe("US-QS-07 · RequestState loading without a skeleton (DS-56)", () => {
  it("US-QS-07 pending without a skeleton shows the PlantLoader as the one loading status", () => {
    render(<RequestState onRetry={() => undefined} status="pending" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Lädt…");
  });
});
