// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { navItems } from "@/shared/patterns/navigation/navigation/navigation";
import {
  DEFAULT_BAR_LABELS,
  barLabelsOf,
  type NavItem,
} from "@/shared/patterns/navigation/nav-item";
import { BAR_LABELS_KEY, startBarLabels, useRememberBarLabels } from "./bar-labels";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** The shell's hook in a component of its own: it stores the labels of the items it is given. */
function Remember(props: { items: NavItem[] }) {
  useRememberBarLabels(props.items);
  return null;
}

const stored = () => JSON.parse(window.localStorage.getItem(BAR_LABELS_KEY) ?? "null");

describe("US-QS-32 the labels of the bottom bar that the start frame draws (issue 2230)", () => {
  it("US-QS-32 the default labels are the labels of the bottom bar of a plain keeper", () => {
    expect(DEFAULT_BAR_LABELS).toEqual(barLabelsOf(navItems({})));
  });

  it("US-QS-32 without a stored copy the start frame draws the defaults", () => {
    expect(startBarLabels()).toEqual(DEFAULT_BAR_LABELS);
  });

  it("US-QS-32 a stored copy that is no usable list falls back to the defaults", () => {
    const unusable = [
      "kein JSON",
      "[]",
      '["Heute",1]',
      JSON.stringify(["a", "b", "c", "d", "e", "f"]),
      '[""]',
    ];
    for (const raw of unusable) {
      window.localStorage.setItem(BAR_LABELS_KEY, raw);
      expect(startBarLabels()).toEqual(DEFAULT_BAR_LABELS);
    }
  });

  it("US-QS-32 the shell stores the labels of its bottom bar, with Mehr when the destinations do not fit", () => {
    render(<Remember items={navItems({ operator: true })} />);
    expect(stored()).toEqual(["Heute", "Sammlung", "Entdecken", "Freunde", "Mehr"]);
  });

  it("US-QS-32 the start frame reads the labels the shell stored on this device", () => {
    render(<Remember items={navItems({})} />);
    expect(startBarLabels()).toEqual(["Heute", "Sammlung", "Entdecken", "Freunde", "Konto"]);
  });
});
