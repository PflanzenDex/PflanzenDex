// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateField, parseDateText, showDateText } from "./date-field";

afterEach(cleanup);

describe("DateField (US-QS-24, NFR-08)", () => {
  it("US-QS-24 shows a calendar date as dd.mm.yyyy and keeps the YYYY-MM-DD value", () => {
    render(<DateField aria-label="Fangdatum" value="2026-10-30" onChange={() => {}} />);
    expect((screen.getByLabelText("Fangdatum") as HTMLInputElement).value).toBe("30.10.2026");
  });

  it("US-QS-24 typed German text reaches the caller as a local calendar date", async () => {
    const seen: string[] = [];
    function Host() {
      const [v, setV] = useState("");
      return (
        <DateField
          aria-label="Tag"
          value={v}
          onChange={(e) => {
            seen.push(e.target.value);
            setV(e.target.value);
          }}
        />
      );
    }
    render(<Host />);
    await userEvent.type(screen.getByLabelText("Tag"), "09.03.2026");
    expect(seen.at(-1)).toBe("2026-03-09");
    expect(seen.slice(0, -1).every((s) => s === "")).toBe(true);
    expect((screen.getByLabelText("Tag") as HTMLInputElement).value).toBe("09.03.2026");
  });

  it("US-QS-24 an impossible day gives an empty value and is marked invalid", () => {
    const onChange = vi.fn();
    render(<DateField aria-label="Tag" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Tag"), { target: { value: "31.02.2026" } });
    expect(onChange.mock.calls[0]?.[0].target.value).toBe("");
    expect(screen.getByLabelText("Tag").getAttribute("aria-invalid")).toBe("true");
  });

  it("US-QS-24 a day after max is marked invalid; the placeholder is German", () => {
    render(<DateField aria-label="Tag" value="2026-11-01" max="2026-10-30" onChange={() => {}} />);
    expect(screen.getByLabelText("Tag").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Tag").getAttribute("placeholder")).toBe("TT.MM.JJJJ");
  });

  it("US-QS-24 parse and show are pure calendar arithmetic (leap day, no time zone)", () => {
    expect(parseDateText("29.02.2028")).toBe("2028-02-29");
    expect(parseDateText("29.02.2026")).toBe("");
    expect(parseDateText("2026-03-09")).toBe("2026-03-09");
    expect(showDateText("2026-03-09")).toBe("09.03.2026");
  });
});
