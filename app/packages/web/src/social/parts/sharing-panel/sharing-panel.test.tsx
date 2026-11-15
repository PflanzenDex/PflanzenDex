// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharingPanel } from "./sharing-panel";

afterEach(cleanup);

describe("US-QS-32 sharing panel copy", () => {
  it("US-QS-32 with no plant it asks for 'eine Pflanze' in the feminine form", () => {
    render(
      <SharingPanel specimens={[]} shared={[]} busy={false} onSet={vi.fn()} onSetAll={vi.fn()} />,
    );
    expect(screen.getByText(/Lege zuerst unter „Sammlung“ eine Pflanze an\./)).toBeTruthy();
  });
});
