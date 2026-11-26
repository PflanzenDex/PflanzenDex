import { devices as presets } from "@playwright/test";

// The devices of the device check (US-DEV-01, issue 2504): three emulated phones in the pinned browser, and the attached real
// phone (`phone`, local only). The sizes are the CSS widths of the devices named in the issue; the heights are the usual ones.

export const DEVICE_IDS = ["iphone16", "oneplus15r", "large", "phone"] as const;
export type DeviceId = (typeof DEVICE_IDS)[number];
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const TEXT_SIZES = ["100", "200"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** A device of the matrix: an emulated context, or the real phone (`phone: true`). */
export interface Device {
  id: DeviceId;
  label: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  userAgent: string;
  phone: boolean;
}

const IPHONE_UA = presets["iPhone 16"].userAgent ?? "";
const ANDROID_UA = presets["Pixel 7"].userAgent ?? "";

export const EMULATED_DEVICES: readonly Device[] = [
  {
    id: "iphone16",
    label: "iPhone 16",
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    userAgent: IPHONE_UA,
    phone: false,
  },
  {
    id: "oneplus15r",
    label: "OnePlus 15R",
    width: 424,
    height: 919,
    deviceScaleFactor: 2.625,
    userAgent: ANDROID_UA,
    phone: false,
  },
  {
    id: "large",
    label: "Large phone",
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    userAgent: IPHONE_UA,
    phone: false,
  },
];

/** Every device id of the matrix, the emulated ones first. The real phone has no size of its own: it reports its own. */
export const DEFAULT_DEVICES: readonly DeviceId[] = EMULATED_DEVICES.map((d) => d.id);

/** The emulated device of an id, or undefined for `phone` (which the spec connects to). */
export function emulatedOf(id: DeviceId): Device | undefined {
  return EMULATED_DEVICES.find((d) => d.id === id);
}

/** A matrix cell: one screen or flow on one device in one theme at one text size. */
export interface Cell {
  kind: "screen" | "flow";
  /** The register id of the screen, or the name of the flow. */
  id: string;
  /** The register id of the screen the cell opens. */
  screen: string;
  device: DeviceId;
  theme: Theme;
  text: TextSize;
  forced: boolean;
}

/** The file-name part of a cell: `<id>-<device>-<theme>-<text>` (plus `-forced`), as the screenshots are named. */
export function cellName(cell: Pick<Cell, "id" | "device" | "theme" | "text" | "forced">): string {
  const forced = cell.forced ? "-forced" : "";
  return `${cell.id}-${cell.device}-${cell.theme}-${cell.text}${forced}`;
}

/** The name of a cell in the test list and in the log: its kind, id, device, theme, text size and forced colors. */
export function titleOf(cell: Cell): string {
  return `${cell.kind} ${cell.id} ${cell.device} ${cell.theme} ${cell.text} %${cell.forced ? " forced" : ""}`;
}
