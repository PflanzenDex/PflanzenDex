// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlain, isTinted } from "@/shared/ui/button.roles";
import { ZoneForm, type ZoneInput } from "./zones-view";

afterEach(cleanup);

describe("US-LIC-05 zone form (US-QS-32 · F-0186)", () => {
  it("US-QS-32 · F-0186 after an empty send, typing 'Probe Zone' and '300' clears both frames with their labels and messages, and the save follows", async () => {
    const onSave = vi.fn<(input: ZoneInput) => Promise<null>>(async () => null);
    render(<ZoneForm onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Lichtzone anlegen" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    const lux = screen.getByRole("spinbutton", { name: "Lux-Obergrenze" });
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    expect(lux.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    await userEvent.type(name, "Probe Zone");
    await userEvent.type(lux, "300");

    await waitFor(() => expect(lux.getAttribute("aria-invalid")).toBeNull());
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryAllByRole("alert")).toEqual([]);
    const labels = [...document.querySelectorAll("label")].filter((l) =>
      ["Name", "Lux-Obergrenze"].includes(l.textContent ?? ""),
    );
    expect(labels.map((l) => l.className.includes("text-destructive"))).toEqual([false, false]);

    await userEvent.click(screen.getByRole("button", { name: "Lichtzone anlegen" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toEqual({
      name: "Probe Zone",
      luxCeiling: 300,
      ppfd: null,
      sortOrder: null,
    });
  });
});

const zone = { id: "z1", name: "Zone 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 };

describe("US-QS-32 · issue 2454 the cancel of the zone form (SG-BTN-06)", () => {
  it("US-QS-32 · issue 2454 'Abbrechen' of the new zone form is plain, not tinted", () => {
    render(<ZoneForm onSave={vi.fn(async () => null)} onCancel={vi.fn()} />);
    const cancel = screen.getByRole("button", { name: "Abbrechen" });
    expect(isPlain(cancel)).toBe(true);
    expect(isTinted(cancel)).toBe(false);
  });

  it("US-QS-32 · issue 2454 'Abbrechen' of the edit zone form is plain, not tinted, and still closes the form", async () => {
    const onCancel = vi.fn();
    render(<ZoneForm start={zone} onSave={vi.fn(async () => null)} onCancel={onCancel} />);
    const cancel = screen.getByRole("button", { name: "Abbrechen" });
    expect(isPlain(cancel)).toBe(true);
    expect(isTinted(cancel)).toBe(false);
    await userEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
