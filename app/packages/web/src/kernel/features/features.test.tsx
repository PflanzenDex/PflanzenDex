// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeaturesProvider, useFeature } from "./features";

function Probe() {
  return (
    <p>
      social:{String(useFeature("social"))} ai:{String(useFeature("ai"))}
    </p>
  );
}

describe("US-DEV-06 features in the web app", () => {
  it("US-DEV-06 counts as on without a provider or a sent state", () => {
    render(<Probe />);
    expect(screen.getByText("social:true ai:true")).toBeTruthy();
  });

  it("US-DEV-06 hides only what is explicitly off", () => {
    render(
      <FeaturesProvider features={{ social: false, ai: true, recommendations: false }}>
        <Probe />
      </FeaturesProvider>,
    );
    expect(screen.getByText("social:false ai:true")).toBeTruthy();
  });
});
