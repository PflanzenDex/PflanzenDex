// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LayerScope, useInLayer } from "./layer-scope";

afterEach(cleanup);

function Probe() {
  return <p>{useInLayer() ? "in a layer" : "on a page"}</p>;
}

describe("US-QS-32 · SG-LIST-01 the scope of a layer", () => {
  it("US-QS-32 · SG-LIST-01 a component on a page is not in a layer", () => {
    render(<Probe />);
    expect(screen.getByText("on a page")).toBeTruthy();
  });

  it("US-QS-32 · SG-LIST-01 a component inside the scope is in a layer", () => {
    render(
      <LayerScope.Provider value>
        <Probe />
      </LayerScope.Provider>,
    );
    expect(screen.getByText("in a layer")).toBeTruthy();
  });
});
