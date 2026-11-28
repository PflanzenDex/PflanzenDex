// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

afterEach(cleanup);

function Controlled(props: { onChange?: (next: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      aria-label="Empfehlungen zeigen"
      checked={on}
      onCheckedChange={(next) => {
        props.onChange?.(next);
        setOn(next);
      }}
    />
  );
}

describe("US-QS-32 Switch: a setting that applies at once is a switch (SG-CTRL-02)", () => {
  it("US-QS-32 is a button with role switch that says on or off through aria-checked", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Empfehlungen zeigen" });
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("US-QS-32 the keyboard turns it with Space and it keeps the focus", async () => {
    render(<Controlled />);
    const toggle = screen.getByRole("switch");
    await userEvent.tab();
    expect(document.activeElement).toBe(toggle);
    await userEvent.keyboard(" ");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(toggle);
  });

  it("US-QS-32 · SG-TOUCH-01 the hit area is 44 px: a 32 px track plus 6 px above and below", () => {
    render(<Controlled />);
    const toggle = screen.getByRole("switch");
    expect(toggle.className).toContain("h-[32px]");
    expect(toggle.className).toContain("after:-inset-y-1.5");
  });

  it("US-QS-32 · DS-38 an invalid switch is exposed with aria-invalid", () => {
    render(<Switch aria-label="x" checked={false} onCheckedChange={() => undefined} invalid />);
    expect(screen.getByRole("switch").getAttribute("aria-invalid")).toBe("true");
  });

  it("US-QS-32 · DS-36 caller classes merge last", () => {
    render(
      <Switch aria-label="x" className="w-[60px]" checked onCheckedChange={() => undefined} />,
    );
    const toggle = screen.getByRole("switch");
    expect(toggle.className).toContain("w-[60px]");
    expect(toggle.className).not.toContain("w-[52px]");
  });
});
