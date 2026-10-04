// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Navigation } from "./navigation";

afterEach(cleanup);

describe("US-BES-10 navigation", () => {
  it("US-BES-10 the review list tab is shown to operators and reviewers only", () => {
    render(<Navigation active="species" onSwitch={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Prüfliste" })).toBeNull();
    cleanup();
    render(<Navigation active="species" onSwitch={() => undefined} reviewer={false} />);
    expect(screen.queryByRole("button", { name: "Prüfliste" })).toBeNull();
    cleanup();
    render(<Navigation active="review" onSwitch={() => undefined} reviewer />);
    expect(screen.getByRole("button", { name: "Prüfliste" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
});

describe("US-ACC-05 navigation", () => {
  it("US-ACC-05 the operator tab is shown to the operator only, not to reviewers", () => {
    render(<Navigation active="species" onSwitch={() => undefined} reviewer />);
    expect(screen.queryByRole("button", { name: "Betreiber" })).toBeNull();
    cleanup();
    render(<Navigation active="operator" onSwitch={() => undefined} operator />);
    expect(screen.getByRole("button", { name: "Betreiber" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
});
