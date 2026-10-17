// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Badge } from "./badge";

afterEach(cleanup);

describe("Badge (US-QS-07, DS-34, DS-36)", () => {
  it("US-QS-07 · DS-36 shows its text and forwards ref and native props", () => {
    const ref = createRef<HTMLSpanElement>();
    render(
      <Badge ref={ref} data-testid="badge">
        Neu
      </Badge>,
    );
    expect(screen.getByText("Neu")).toBe(ref.current);
    expect(screen.getByTestId("badge")).toBe(ref.current);
  });

  it("US-QS-07 · DS-31 caller classes come last", () => {
    render(<Badge className="px-6">Breit</Badge>);
    const cls = screen.getByText("Breit").className;
    expect(cls).toContain("px-6");
    expect(cls).not.toContain("px-2.5");
  });

  it("US-QS-07 · DS-35 offers every named variant and a different look for each", () => {
    const seen = new Set<string>();
    for (const variant of ["default", "secondary", "outline", "destructive", "warning"] as const) {
      render(<Badge variant={variant}>{variant}</Badge>);
      seen.add(screen.getByText(variant).className);
    }
    expect(seen.size).toBe(5);
  });

  it("US-QS-07 · DS-38 a warning is carried by its text, not by colour alone", () => {
    render(<Badge variant="warning">Etioliert</Badge>);
    expect(screen.getByText("Etioliert")).toBeTruthy();
  });

  it("US-QS-14 · Greenhouse look: pill with 13 px label text", () => {
    render(<Badge>Neu</Badge>);
    const cls = screen.getByText("Neu").className;
    expect(cls).toContain("rounded-pill");
    expect(cls).toContain("text-label");
  });
});
