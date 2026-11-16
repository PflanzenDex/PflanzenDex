// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { navItems } from "@/shared/patterns/navigation/navigation/navigation";
import { DEFAULT_BAR_SLOTS, type NavItem } from "@/shared/patterns/navigation/nav-item";
import { barSlotsOf, useRememberBarSlots } from "../../mobile-nav-bar/bar-slots";
import { BAR_LABELS_KEY, startBarSlots } from "./bar-labels";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** The shell's hook in a component of its own: it stores the slots of the items it is given. */
function Remember(props: { items: NavItem[] }) {
  useRememberBarSlots(props.items);
  return null;
}

const stored = () => JSON.parse(window.localStorage.getItem(BAR_LABELS_KEY) ?? "null");

describe("US-QS-32 the slots of the bottom bar that the start frame draws (issue 2230, issue 2249)", () => {
  it("US-QS-32 (issue 2249) the default slots are the slots of the bottom bar of a plain keeper, at both text sizes", () => {
    expect(DEFAULT_BAR_SLOTS).toEqual(
      barSlotsOf(navItems({})).map(({ label, show }) => ({ label, show })),
    );
  });

  it("US-QS-32 without a stored copy the start frame draws the defaults", () => {
    expect(startBarSlots()).toEqual(DEFAULT_BAR_SLOTS);
  });

  it("US-QS-32 a stored copy that is no usable list falls back to the defaults (issue 2249)", () => {
    const unusable = [
      "kein JSON",
      "[]",
      '["Heute","Sammlung"]',
      '[{"label":"Heute","show":"sometimes"}]',
      '[{"label":"","show":"always"}]',
      '[{"show":"always"}]',
      JSON.stringify(Array.from({ length: 11 }, () => ({ label: "Heute", show: "always" }))),
    ];
    for (const raw of unusable) {
      window.localStorage.setItem(BAR_LABELS_KEY, raw);
      expect(startBarSlots()).toEqual(DEFAULT_BAR_SLOTS);
    }
  });

  it("US-QS-32 the shell stores its slots, Mehr with the large text included, when the destinations do not fit (issue 2249)", () => {
    render(<Remember items={navItems({ operator: true })} />);
    expect(stored()).toEqual([
      { label: "Heute", show: "always" },
      { label: "Sammlung", show: "always" },
      { label: "Entdecken", show: "normal" },
      { label: "Freunde", show: "always" },
      { label: "Konto", show: "large" },
      { label: "Mehr", show: "normal" },
      { label: "Mehr", show: "large" },
    ]);
  });

  it("US-QS-32 the start frame reads the slots the shell stored on this device (issue 2249)", () => {
    render(<Remember items={navItems({ operator: true })} />);
    expect(startBarSlots()).toEqual(stored());
  });
});
