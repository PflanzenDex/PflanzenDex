// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OctagonAlert } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendKey, forgetRepeatKeys, useWriteAction, type ApiError } from "../../../shared/data";
import { RefusalAlert } from "./notices";

afterEach(() => {
  cleanup();
  forgetRepeatKeys();
});

function errorMark(): string {
  const { container } = render(<OctagonAlert />);
  const markup = container.querySelector("svg")?.innerHTML ?? "";
  cleanup();
  return markup;
}

const refusal: ApiError = { code: "input.invalid", text: "" };

describe("RefusalAlert of the care views (US-QS-32 · SG-COLOR-04, SG-STATE-03)", () => {
  it("US-QS-32 · SG-COLOR-04 a refusal is drawn in the error tone: red border, error mark, no warning token", () => {
    const { container } = render(<RefusalAlert error={refusal} />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("border-destructive");
    expect(alert.className).not.toMatch(/warning/);
    expect(alert.querySelector("svg")?.innerHTML).toBe(errorMark());
    expect(container.querySelector(".bg-warning")).toBeNull();
  });

  it("US-QS-32 · P-10 the refusal takes the focus and keeps its German text", () => {
    render(<RefusalAlert error={refusal} />);
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(alert);
    expect(alert.textContent).toContain(
      "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
    );
  });
});

describe("US-QS-03 · the key conflict banner of the care views names what is saved", () => {
  const conflict: ApiError = {
    code: "idempotency.key_conflict",
    text: "x",
    conflictText: "Gesichert ist: 12 cm am 22.11.2026. Deine Änderung ist noch nicht gesichert.",
  };

  it("US-QS-03 the banner names the saved entry, and its one control 'Hinweis schließen' frees the key", () => {
    const onDismiss = vi.fn();
    render(<RefusalAlert error={conflict} onDismiss={onDismiss} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "Gesichert ist: 12 cm am 22.11.2026. Deine Änderung ist noch nicht gesichert.",
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("US-QS-03 P-10 a refusal without a dismiss control stays until the keeper acts elsewhere", () => {
    render(<RefusalAlert error={refusal} />);
    expect(screen.queryByRole("button", { name: "Hinweis schließen" })).toBeNull();
  });

  it("US-QS-03 the banner wraps its text inside the window at 360 px and 200 % text, it never truncates it", () => {
    render(<RefusalAlert error={conflict} onDismiss={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("min-w-0");
    expect(alert.querySelector("div.break-words")).not.toBeNull();
  });
});

describe("US-QS-03 · P-10 a RefusalAlert of a write offers the dismiss of its key conflict without a call site change", () => {
  const conflict = (dismiss?: () => void): ApiError => ({
    code: "idempotency.key_conflict",
    text: "x",
    ...(dismiss ? { dismiss } : {}),
  });

  it("US-QS-03 the dismiss the write layer put on the error is the control, and its click calls it", () => {
    const dismiss = vi.fn();
    render(<RefusalAlert error={conflict(dismiss)} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("US-QS-03 an explicit onDismiss wins over the dismiss of the error", () => {
    const own = vi.fn();
    const carried = vi.fn();
    render(<RefusalAlert error={conflict(carried)} onDismiss={own} />);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(own).toHaveBeenCalledTimes(1);
    expect(carried).not.toHaveBeenCalled();
  });

  it("US-QS-03 a refusal of another code shows no control", () => {
    render(<RefusalAlert error={refusal} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US-QS-03 · P-10 through useWriteAction: the refusal of a repeated create with another body can be dismissed, the next tap writes", async () => {
    const records = new Map<string, string>();
    const sent: string[] = [];
    // The first answer is lost on the way back (the write is applied); a key that comes back with another body conflicts.
    let lost = 1;
    const answer = (body: string) => async (_token: string, options: { key: string }) => {
      const seen = records.get(options.key);
      sent.push(`${options.key}:${body}`);
      if (seen !== undefined && seen !== body)
        return { ok: false as const, error: { code: "idempotency.key_conflict", text: "x" } };
      records.set(options.key, body);
      if (lost-- > 0)
        return { ok: false as const, error: { code: "network.not_reachable", text: "x" } };
      return { ok: true as const, value: {} };
    };
    const scope = appendKey("specimen", "n1", "note");
    let write!: ReturnType<typeof useWriteAction>;
    function Page({ body }: { body: string }) {
      write = useWriteAction(
        async () => "tok",
        () => undefined,
      );
      return (
        <>
          <button type="button" onClick={() => void write.run(answer(body), "Gesichert.", scope)}>
            Sichern
          </button>
          {write.error ? <RefusalAlert error={write.error} /> : null}
        </>
      );
    }
    const { rerender } = render(<Page body="A" />);
    const save = screen.getByRole("button", { name: "Sichern" });
    save.focus();
    await act(async () => fireEvent.click(save));
    expect(screen.queryByRole("button", { name: "Hinweis schließen" })).toBeNull();
    rerender(<Page body="B" />);
    await act(async () => fireEvent.click(save));
    expect(screen.getByRole("alert").textContent).toContain("Deine erste Eingabe ist gesichert.");
    // The alert took the focus; the keeper goes back to the button (Tab) and taps it again: the key is still held.
    save.focus();
    await act(async () => fireEvent.click(save));
    expect(sent[2]?.split(":")[0]).toBe(sent[0]?.split(":")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(save);
    await act(async () => fireEvent.click(save));
    expect(sent[3]?.split(":")[0]).not.toBe(sent[0]?.split(":")[0]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
