// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useFirstPlant } from "./use-first-plant";

afterEach(cleanup);

function Steps() {
  const flow = useFirstPlant("http://api.test", () => Promise.resolve("token"));
  return (
    <div ref={flow.box}>
      <h2 tabIndex={-1}>Schritt {flow.index}</h2>
      <button type="button" onClick={() => flow.setIndex(flow.index + 1)}>
        Weiter
      </button>
    </div>
  );
}

const view = () => render(<Steps />);

describe("US-ONB-01 · the focus in the first-plant flow (issue 1362)", () => {
  it("US-ONB-01 the flow appearing leaves the focus alone", () => {
    view();
    expect(document.activeElement).toBe(document.body);
  });

  it("US-ONB-01 a new step moves the focus to its heading", async () => {
    view();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Schritt 1" }));
  });
});
