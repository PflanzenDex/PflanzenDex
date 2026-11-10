/**
 * The keys of the keyboard shortcuts (US-QS-11, DS-70): which keys the register may take, which the browser, the operating
 * system or a screen reader owns, how a key press is matched in a mode, and where a press never fires (text fields).
 * Pure: no state, no navigation. `register.ts` holds the starting set and its build-time guard.
 */
import type { KeyboardShortcutMode } from "@pflanzendex/core";

export type ShortcutLetter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";

/** The keys a shortcut may take: one lowercase letter, `?` (the overview) and `/` (search). Nothing else (2.1.4). */
export type ShortcutKey = ShortcutLetter | "?" | "/";

/**
 * The modes of the account's setting, by name (`plain` single characters, `modifier` Alt+Shift, `disabled`). The values are
 * the ones of the core profile; the web compares with these names, never with literals.
 */
export const SHORTCUT_MODE = {
  plain: "plain",
  modifier: "modifier",
  disabled: "disabled",
} as const;

/**
 * Key names that browsers, the operating system and screen readers use: Tab and Enter, Space, Escape, the arrows and
 * the editing and paging keys, the lock keys (CapsLock and Insert are screen reader modifiers), Meta and Control, and
 * the F-keys (see `isReservedKeyName`).
 */
export const RESERVED_KEY_NAMES: readonly string[] = [
  "Tab",
  "Enter",
  " ",
  "Spacebar",
  "Escape",
  "Esc",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Pause",
  "PrintScreen",
  "ContextMenu",
  "Meta",
  "OS",
  "Control",
  "Alt",
  "AltGraph",
  "Shift",
  "Fn",
  "Clear",
];

const FUNCTION_KEY = /^F\d{1,2}$/;
const LETTER = /^[a-z]$/;

export function isReservedKeyName(key: string): boolean {
  return RESERVED_KEY_NAMES.includes(key) || FUNCTION_KEY.test(key);
}

export type KeyCombo = {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
};

/**
 * Why a combination belongs to the browser, the operating system or a screen reader, or `null` when the register may
 * take it. The register takes a plain key, or Alt+Shift with a key (the modifier mode); Ctrl and Cmd combinations and
 * Alt without Shift (menu access keys, Alt+arrow) stay with the browser.
 */
export function reservedReason(combo: KeyCombo): string | null {
  if (isReservedKeyName(combo.key))
    return `${combo.key} is used by the browser, the operating system or a screen reader`;
  if (combo.ctrl || combo.meta) return "Ctrl and Cmd combinations belong to the browser and the OS";
  if (combo.alt && !combo.shift)
    return "Alt combinations open browser menus and access keys, Alt+arrow navigates";
  return null;
}

export function isShortcutKey(key: string): key is ShortcutKey {
  return LETTER.test(key) || key === "?" || key === "/";
}

/** The parts of a key press the matching reads; a `KeyboardEvent` has all of them. */
export type KeyInput = {
  key: string;
  code: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
};

/** The physical key of a shortcut: `KeyH` for h, `Slash` for ? and /. Alt+Shift matches it, so macOS characters do not matter. */
export function physicalCode(key: ShortcutKey): string {
  return LETTER.test(key) ? `Key${key.toUpperCase()}` : "Slash";
}

/**
 * Whether a key press fires a shortcut with this key in a mode. `plain`: the character, without Alt, Ctrl or Cmd (a letter
 * also without Shift, so Shift+H types a capital). `modifier`: Alt+Shift with the physical key. `disabled`: never. A held key
 * that repeats never fires again.
 */
export function matchesShortcut(
  input: KeyInput,
  shortcut: { readonly key: ShortcutKey },
  mode: KeyboardShortcutMode,
): boolean {
  if (mode === SHORTCUT_MODE.disabled || input.repeat || input.ctrlKey || input.metaKey)
    return false;
  if (mode === SHORTCUT_MODE.modifier)
    return input.altKey && input.shiftKey && input.code === physicalCode(shortcut.key);
  if (input.altKey) return false;
  if (LETTER.test(shortcut.key)) return !input.shiftKey && input.key.toLowerCase() === shortcut.key;
  return input.key === shortcut.key;
}

const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);
const EDITABLE = 'textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Whether a key press lands in something that takes text or a choice: a text field (any input but buttons, boxes and
 * the like), a text area, a select or an editable area. Shortcuts never fire there (WCAG 2.1.4).
 */
export function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(EDITABLE)) return true;
  const input = target.closest("input");
  return input !== null && !NON_TEXT_INPUTS.has(input.type);
}
