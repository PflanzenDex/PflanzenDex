// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayFilter } from "./today-filter";

afterEach(cleanup);

describe("US-QS-26 the filter view of Heute", () => {
  it("US-QS-26 the page names its filter, the hidden tasks and the one control that clears it", () => {
    render(
      <TodayFilter onClear={() => undefined}>
        <p>Die Liste</p>
      </TodayFilter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Heute" })).toBeTruthy();
    expect(screen.getByText("Nur Gießen ist angezeigt.")).toBeTruthy();
    expect(
      screen.getByText("Behandlungen und fehlende Angaben sind ausgeblendet.", { exact: false }),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: "Gießen" })).toBeTruthy();
    expect(screen.getByText("Die Liste")).toBeTruthy();
  });

  it("US-QS-26 the clear control calls its handler once", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <TodayFilter onClear={onClear}>
        <p>Die Liste</p>
      </TodayFilter>,
    );
    await user.click(screen.getByRole("button", { name: "Alle Aufgaben zeigen" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
