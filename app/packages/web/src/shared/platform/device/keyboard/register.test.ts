// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defineShortcuts, REGISTER, SHORTCUT_IDS, type ShortcutSpec } from "./register";
import { isTextTarget, matchesShortcut, reservedReason, type KeyInput } from "./keys";

/** A key press as the browser reports it; the defaults are a plain press of a key without modifiers. */
const press = (over: Partial<KeyInput>): KeyInput => ({
  key: "",
  code: "",
  altKey: false,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  ...over,
});

describe("US-QS-11 · one central register of shortcuts", () => {
  it("US-QS-11 holds the starting set: the overview, search, Heute, Sammlung, Pokédex and Wunschliste", () => {
    expect([...SHORTCUT_IDS].sort()).toEqual(
      ["collection", "overview", "search", "species", "today", "wishlist"].sort(),
    );
    expect(REGISTER.map((s) => s.key).sort()).toEqual(["/", "?", "h", "p", "s", "w"].sort());
  });

  it("US-QS-11 every register entry passes the guard again (a second check of the built register)", () => {
    expect(() => defineShortcuts(REGISTER)).not.toThrow();
  });

  it("US-QS-11 the register rejects a reserved key at build time: Tab, Escape, F5, arrows, Enter, Space, Insert, CapsLock", () => {
    for (const key of [
      "Tab",
      "Escape",
      "F5",
      "F12",
      "ArrowDown",
      "Enter",
      " ",
      "Insert",
      "CapsLock",
      "Home",
    ]) {
      expect(() => defineShortcuts([{ id: "today", key } as unknown as ShortcutSpec]), key).toThrow(
        /is reserved/,
      );
    }
  });

  it("US-QS-11 the register refuses any other key that is no letter, ? or / (a digit, a symbol, a non-Latin letter)", () => {
    for (const key of ["1", "+", "ä", "Ä"])
      expect(() => defineShortcuts([{ id: "today", key } as unknown as ShortcutSpec]), key).toThrow(
        /not a shortcut key/,
      );
  });

  it("US-QS-11 the register rejects browser and operating system combinations: Ctrl+L, Cmd+K, Alt+ArrowLeft, Alt+H, Ctrl+Alt+K, Shift+Tab", () => {
    expect(reservedReason({ key: "l", ctrl: true })).not.toBeNull();
    expect(reservedReason({ key: "k", meta: true })).not.toBeNull();
    expect(reservedReason({ key: "ArrowLeft", alt: true })).not.toBeNull();
    expect(reservedReason({ key: "h", alt: true })).not.toBeNull();
    expect(reservedReason({ key: "k", ctrl: true, alt: true })).not.toBeNull();
    expect(reservedReason({ key: "Tab", shift: true })).not.toBeNull();
    expect(reservedReason({ key: "F5" })).not.toBeNull();
  });

  it("US-QS-11 keeps the keys the register may take: a letter, ? and /, plain or with Alt+Shift", () => {
    expect(reservedReason({ key: "h" })).toBeNull();
    expect(reservedReason({ key: "?", shift: true })).toBeNull();
    expect(reservedReason({ key: "/" })).toBeNull();
    expect(reservedReason({ key: "h", alt: true, shift: true })).toBeNull();
  });

  it("US-QS-11 refuses two shortcuts with the same key or the same id", () => {
    expect(() =>
      defineShortcuts([
        { id: "today", key: "h" },
        { id: "collection", key: "h" },
      ]),
    ).toThrow(/twice/);
    expect(() =>
      defineShortcuts([
        { id: "today", key: "h" },
        { id: "today", key: "j" },
      ]),
    ).toThrow(/twice/);
  });
});

describe("US-QS-11 · matching a key press to the register", () => {
  const today = REGISTER.find((s) => s.id === "today") as ShortcutSpec;
  const overview = REGISTER.find((s) => s.id === "overview") as ShortcutSpec;

  it("US-QS-11 a plain letter fires in the plain mode (starting value) and only without modifiers", () => {
    expect(matchesShortcut(press({ key: "h", code: "KeyH" }), today, "plain")).toBe(true);
    expect(matchesShortcut(press({ key: "h", code: "KeyH", ctrlKey: true }), today, "plain")).toBe(
      false,
    );
    expect(matchesShortcut(press({ key: "h", code: "KeyH", altKey: true }), today, "plain")).toBe(
      false,
    );
    expect(matchesShortcut(press({ key: "H", code: "KeyH", shiftKey: true }), today, "plain")).toBe(
      false,
    );
  });

  it("US-QS-11 a press that repeats while held does not fire again", () => {
    expect(matchesShortcut(press({ key: "h", code: "KeyH", repeat: true }), today, "plain")).toBe(
      false,
    );
  });

  it("US-QS-11 the question mark fires in the plain mode, the overview key has no other modifier", () => {
    expect(
      matchesShortcut(press({ key: "?", code: "Slash", shiftKey: true }), overview, "plain"),
    ).toBe(true);
    expect(
      matchesShortcut(
        press({ key: "?", code: "Slash", shiftKey: true, altKey: true }),
        overview,
        "plain",
      ),
    ).toBe(false);
  });

  it("US-QS-11 the modifier mode takes Alt+Shift with the physical key, so macOS characters do not matter", () => {
    expect(
      matchesShortcut(
        press({ key: "H", code: "KeyH", altKey: true, shiftKey: true }),
        today,
        "modifier",
      ),
    ).toBe(true);
    expect(matchesShortcut(press({ key: "h", code: "KeyH" }), today, "modifier")).toBe(false);
    expect(
      matchesShortcut(press({ key: "h", code: "KeyH", altKey: true }), today, "modifier"),
    ).toBe(false);
    expect(
      matchesShortcut(
        press({ key: "?", code: "Slash", altKey: true, shiftKey: true }),
        overview,
        "modifier",
      ),
    ).toBe(true);
  });

  it("US-QS-11 the mode off takes no key at all", () => {
    expect(matchesShortcut(press({ key: "h", code: "KeyH" }), today, "disabled")).toBe(false);
    expect(
      matchesShortcut(
        press({ key: "H", code: "KeyH", altKey: true, shiftKey: true }),
        today,
        "disabled",
      ),
    ).toBe(false);
  });
});

describe("US-QS-11 · a shortcut never fires in a text field", () => {
  it("US-QS-11 text fields, areas, selects and editable areas count as text", () => {
    const field = (html: string) => {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.append(host);
      return host.firstElementChild;
    };
    expect(isTextTarget(field('<input type="text">'))).toBe(true);
    expect(isTextTarget(field('<input type="search">'))).toBe(true);
    expect(isTextTarget(field("<textarea></textarea>"))).toBe(true);
    expect(isTextTarget(field("<select><option>a</option></select>"))).toBe(true);
    expect(isTextTarget(field('<div contenteditable="true"><span>x</span></div>'))).toBe(true);
    expect(
      isTextTarget(
        field('<div contenteditable="true"><span>x</span></div>')?.querySelector("span") ?? null,
      ),
    ).toBe(true);
  });

  it("US-QS-11 buttons, checkboxes and links do not count as text, so the shortcut still works there", () => {
    const field = (html: string) => {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.append(host);
      return host.firstElementChild;
    };
    expect(isTextTarget(field('<input type="checkbox">'))).toBe(false);
    expect(isTextTarget(field("<button>Heute</button>"))).toBe(false);
    expect(isTextTarget(field('<a href="/today">Heute</a>'))).toBe(false);
    expect(isTextTarget(null)).toBe(false);
  });
});
