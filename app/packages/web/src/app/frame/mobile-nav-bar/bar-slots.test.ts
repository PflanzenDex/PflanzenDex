import { describe, expect, it } from "vitest";
import { navItems } from "@/shared/patterns/navigation/navigation/navigation";
import {
  DEFAULT_BAR_SLOTS,
  type BarSlot,
  type NavItem,
} from "@/shared/patterns/navigation/nav-item";
import { barSlotsOf } from "./bar-slots";

/** The slots as "label:show", so a test reads the layout of both text sizes at a glance. */
const shapeOf = (slots: BarSlot[]) => slots.map((s) => `${s.label}:${s.show}`);

/** The labels of the destinations in the drawer of a "Mehr" slot. */
const drawerOf = (slot: BarSlot | undefined) =>
  slot && "drawer" in slot ? slot.drawer.map((i) => i.label) : null;

const item = (href: string, label: string): NavItem => ({ href, label, icon: null });

describe("US-QS-32 the slots of the bottom bar at a large text size (SG-NAV-07, issue 2249)", () => {
  it("US-QS-32 (issue 2249) the plain keeper: at large text Entdecken moves into Mehr, the bar keeps four destinations", () => {
    const slots = barSlotsOf(navItems({}));
    expect(shapeOf(slots)).toEqual([
      "Heute:always",
      "Sammlung:always",
      "Entdecken:normal",
      "Freunde:always",
      "Konto:always",
      "Mehr:large",
    ]);
    expect(drawerOf(slots[5])).toEqual(["Entdecken"]);
  });

  it("US-QS-32 (issue 2249) an overflow keeper (drseed3): one Mehr per text size, each the last slot of its layout, Entdecken in the large one", () => {
    const slots = barSlotsOf(navItems({ operator: true, reviewer: true }));
    expect(shapeOf(slots)).toEqual([
      "Heute:always",
      "Sammlung:always",
      "Entdecken:normal",
      "Freunde:always",
      "Konto:large",
      "Mehr:normal",
      "Mehr:large",
    ]);
    expect(drawerOf(slots[5])).toEqual(["Konto", "Prüfliste", "Betreiber"]);
    expect(drawerOf(slots[6])).toEqual(["Entdecken", "Prüfliste", "Betreiber"]);
  });

  it("US-QS-32 (issue 2249) without Entdecken nothing changes at large text: every slot shows at both sizes", () => {
    const without = navItems({}).filter((i) => i.href !== "/discover");
    expect(shapeOf(barSlotsOf(without))).toEqual([
      "Heute:always",
      "Sammlung:always",
      "Freunde:always",
      "Konto:always",
    ]);
    const overflow = navItems({ operator: true, reviewer: true }).filter(
      (i) => i.href !== "/discover",
    );
    const slots = barSlotsOf(overflow);
    expect(shapeOf(slots)).toEqual([
      "Heute:always",
      "Sammlung:always",
      "Freunde:always",
      "Konto:always",
      "Mehr:always",
    ]);
    expect(drawerOf(slots[4])).toEqual(["Prüfliste", "Betreiber"]);
  });

  it("US-QS-32 (issue 2249) Entdecken already in the drawer at normal text changes nothing at large text", () => {
    const items = [
      item("/a", "Ana"),
      item("/b", "Bea"),
      item("/c", "Cem"),
      item("/d", "Dora"),
      item("/discover", "Entdecken"),
      item("/f", "Fritz"),
    ];
    const slots = barSlotsOf(items);
    expect(shapeOf(slots)).toEqual([
      "Ana:always",
      "Bea:always",
      "Cem:always",
      "Dora:always",
      "Mehr:always",
    ]);
    expect(drawerOf(slots[4])).toEqual(["Entdecken", "Fritz"]);
  });

  it("US-QS-32 (issue 2249) the stored default is the layout of the plain keeper, as the start frame draws it", () => {
    const stored = barSlotsOf(navItems({})).map(({ label, show }) => ({ label, show }));
    expect(DEFAULT_BAR_SLOTS).toEqual(stored);
  });
});
