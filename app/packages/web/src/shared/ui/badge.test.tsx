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

  it("US-QS-07 · US-QS-32 · DS-35 offers every named variant, each with its own look (no secondary variant, issue 1884)", () => {
    const variants = ["default", "outline", "destructive", "warning"] as const;
    for (const variant of variants) render(<Badge variant={variant}>{variant}</Badge>);
    const looks = variants.map((variant) => screen.getByText(variant).className);
    expect(new Set(looks).size).toBe(variants.length);
    for (const look of looks) expect(look).not.toContain("bg-primary");
  });

  it("US-QS-32 · SG-COLOR-01 the default badge is the neutral state look: group fill, text in foreground, no primary", () => {
    render(<Badge>Du hast sie</Badge>);
    const cls = screen.getByText("Du hast sie").className;
    expect(cls).toContain("bg-secondary");
    expect(cls).toContain("text-foreground");
    expect(cls).not.toContain("bg-primary");
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
