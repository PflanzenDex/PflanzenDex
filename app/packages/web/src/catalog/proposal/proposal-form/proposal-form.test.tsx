// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProposalForm } from "./proposal-form";

// US-QS-32 · SG-FORM-01 (issue 1993, F-0245): an optional field says "(optional)", a required one says nothing, and the
// step line never contradicts the validation.
afterEach(cleanup);

const renderStep = (startStep: 1 | 2) =>
  render(
    <ProposalForm startStep={startStep} onSend={vi.fn(async () => null)} onExisting={vi.fn()} />,
  );

describe("US-QS-32 · SG-FORM-01 the species proposal marks its fields", () => {
  it("US-QS-32 · SG-FORM-01 step 2 says 'Schritt 2 von 2' and neither 'alles optional' nor a star", () => {
    const { container } = renderStep(2);
    expect(screen.getByText("Schritt 2 von 2")).toBeTruthy();
    expect(screen.queryByText(/alles optional/)).toBeNull();
    expect(container.textContent).not.toContain("*");
  });

  it("US-QS-32 · SG-FORM-01 step 1 says 'Schritt 1 von 2' and no legend about stars", () => {
    const { container } = renderStep(1);
    expect(screen.getByText("Schritt 1 von 2")).toBeTruthy();
    expect(screen.queryByText(/Pflichtfeld/)).toBeNull();
    expect(container.textContent).not.toContain("*");
  });

  it("US-QS-32 · SG-FORM-01 every optional field of step 2 says '(optional)', the ones behind Mehr Angaben too", () => {
    renderStep(2);
    for (const label of [
      "Schwierigkeit (optional)",
      "Standard-Lichtzone (optional)",
      "Weichblättrige C3-Pflanze (sonnenliebend) (optional)",
      "Deutscher Name (optional)",
      "Familie (deutsch) (optional)",
      "Quelle (optional)",
      "Synonyme (eins pro Zeile) (optional)",
      "Botanische Story (optional)",
    ])
      expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it("US-QS-32 · SG-FORM-01 the light demand is labelled without its unit, with the suffix 'lx' in the field", () => {
    renderStep(2);
    const lux = screen.getByLabelText("Lichtbedarf für maximales Wachstum (optional)");
    expect(lux).toBeTruthy();
    expect(screen.queryByLabelText(/\(Lux\)/)).toBeNull();
    expect(screen.getByText("lx")).toBeTruthy();
  });

  it("US-QS-32 · SG-FORM-01 the two required texts carry no mark and one hint line each", () => {
    renderStep(2);
    const etiolation = screen.getByLabelText("Vergeilungsanzeichen");
    const success = screen.getByLabelText("Erfolgskriterien");
    expect((etiolation as HTMLTextAreaElement).required).toBe(true);
    expect((success as HTMLTextAreaElement).required).toBe(true);
    expect(screen.queryByLabelText(/Vergeilungsanzeichen \(optional\)/)).toBeNull();
    const hintOf = (el: HTMLElement) =>
      (el.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent);
    expect(hintOf(etiolation)).toContain("Wie zeigt deine Pflanze Lichtmangel?");
    expect(hintOf(success)).toContain("Woran erkennst du, dass es deiner Pflanze gut geht?");
  });
});
