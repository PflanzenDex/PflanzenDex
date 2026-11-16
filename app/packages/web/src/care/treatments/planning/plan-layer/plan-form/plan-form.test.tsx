// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanForm } from "./plan-form";

afterEach(cleanup);

const SPECIMENS = [
  { id: "s1", name: "Aloe", location: "Fenster" },
  { id: "s2", name: "Monstera", location: "Balkon" },
];

function submitPlan() {
  fireEvent.submit(screen.getByRole("form", { name: "Behandlung planen" }));
}

describe("US-BEH-01 the plan form marks the segments of a refused send (US-QS-32 · F-0106)", () => {
  it("US-QS-32 · F-0106 a refused send marks both segments with their counts, the messages stay at their fields, and the first segment with an error opens with its focus", async () => {
    const onSend = vi.fn(async () => true);
    render(
      <MemoryRouter>
        <PlanForm specimens={SPECIMENS} running={false} onSend={onSend} />
      </MemoryRouter>,
    );
    submitPlan();
    expect(
      await screen.findByRole("button", { name: "Pflanzen (0), 1 Angabe fehlt" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Termin, 1 Angabe fehlt" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Pflanzen (0), 1 Angabe fehlt" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Wähle mindestens eine Pflanze.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole("checkbox")[0]));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("US-QS-32 · F-0106 a plant chosen and the reason missing: only the term is marked, and the reason takes the focus", async () => {
    const onSend = vi.fn(async () => true);
    render(
      <MemoryRouter>
        <PlanForm specimens={SPECIMENS} running={false} onSend={onSend} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /^Aloe/ }));
    submitPlan();
    expect(await screen.findByRole("button", { name: "Termin, 1 Angabe fehlt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pflanzen (1)" })).toBeTruthy();
    expect(screen.getByLabelText(/Grund/)).toBe(document.activeElement);
    expect(screen.getByText("Nenne einen Grund, zum Beispiel Wollläuse.")).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/Grund/), "Wollläuse");
    await waitFor(() => expect(screen.getByRole("button", { name: "Termin" })).toBeTruthy());
    expect(onSend).not.toHaveBeenCalled();
  });
});
