// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WishForm } from "./wish-form";

// US-QS-32 (issue 1947, F-0171): the required Name is in the visible part of the form, the optional fields behind
// "Mehr Angaben" and marked "(optional)" (SG-FORM-01, SG-FORM-04).
afterEach(cleanup);

function renderForm() {
  render(
    <WishForm
      access={{ api: "http://localhost", token: async () => undefined }}
      zones={[]}
      running={false}
      message={null}
      error={null}
      onSend={vi.fn(async () => true)}
    />,
  );
}

describe("US-QS-32 · SG-FORM-04 the wish form asks its required name without a disclosure", () => {
  it("US-QS-32 · SG-FORM-04 the required Name is not behind Mehr Angaben", () => {
    renderForm();
    const name = screen.getByLabelText("Name");
    expect(name.closest("details")).toBeNull();
    expect(screen.getByText("Mehr Angaben")).toBeTruthy();
  });

  it("US-QS-32 · SG-FORM-01 the optional fields behind Mehr Angaben say '(optional)'", () => {
    renderForm();
    const details = screen.getByText("Mehr Angaben").closest("details");
    expect(details).not.toBeNull();
    expect(details?.contains(screen.getByLabelText("Deutscher Name (optional)"))).toBe(true);
    expect(details?.contains(screen.getByLabelText("Schwierigkeit (optional)"))).toBe(true);
    expect(details?.contains(screen.getByLabelText("Bild-Adresse (optional)"))).toBe(true);
    expect(details?.contains(screen.getByLabelText("Bildquelle (optional)"))).toBe(true);
  });
});

describe("US-QS-32 · issue 1964 the own name of a search without a hit", () => {
  it("US-QS-32 · issue 1964 'Als eigenen Wunsch übernehmen' puts the searched text into the Name field and focuses it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ species: [], more: false }), { status: 200 }),
      ),
    );
    render(
      <WishForm
        access={{ api: "http://localhost", token: async () => "tok" }}
        zones={[]}
        running={false}
        message={null}
        error={null}
        onSend={vi.fn(async () => true)}
      />,
    );
    await userEvent.type(screen.getByLabelText("Art suchen"), "Zzz Pflanze");
    await userEvent.click(
      await screen.findByRole("button", { name: "Als eigenen Wunsch übernehmen" }),
    );
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    expect(name.value).toBe("Zzz Pflanze");
    expect(document.activeElement).toBe(name);
    vi.unstubAllGlobals();
  });
});
