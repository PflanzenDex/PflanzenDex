// US-QS-07 · Usable on mobile: the installable web app and its icon. Checked without a browser: the manifest, every icon
// file it names, the links of index.html, the favicon SVG and the favicon of the login theme (the same artwork). The look
// of the icons is checked by eye (docs/records) and the installability in Lighthouse and on a phone.
// US-QS-26 · the install sheet (description, screenshots) and the shortcuts of the manifest.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADD_PLANT_PATH, PATHS } from "../../shared/patterns/navigation/navigation/navigation";
import {
  taskFilterOf,
  WATERING_TASKS_ADDRESS,
} from "../../today/today-page/today-filter/task-filter";

const here = (path: string) => new URL(path, import.meta.url);
const publicFile = (path: string) => readFileSync(here(`./public${path}`));
const PNG_SIGNATURE = "89504e470d0a1a0a";

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
interface ManifestScreenshot extends ManifestIcon {
  form_factor?: string;
  label?: string;
}
interface ManifestShortcut {
  name: string;
  short_name: string;
  url: string;
  icons: ManifestIcon[];
}
interface Manifest {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  lang: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
  screenshots: ManifestScreenshot[];
  shortcuts: ManifestShortcut[];
}
interface ScreenshotModule {
  SCREENSHOTS: { file: string; story: string }[];
  SIZE: { width: number; height: number };
}
// The screenshot script is a Node script without types, so it is not a static import (as build-icons below).
const screenshotsScript = "./capture-screenshots.mjs";
const screenshotScript = (await import(/* @vite-ignore */ screenshotsScript)) as ScreenshotModule;

const manifest = JSON.parse(publicFile("/manifest.webmanifest").toString("utf8")) as Manifest;

/** The brand green of the icon: `--primary` of the light scheme in the web tokens (the icon's tile and the manifest use it). */
const tokens = readFileSync(here("../tokens.css"), "utf8");
const BRAND = tokens.match(/--primary:\s*(#[0-9a-fA-F]{6});/)?.[1]?.toLowerCase();

/** Width, height and colour type of a PNG (IHDR chunk, RFC 2083). */
function pngInfo(bytes: Buffer) {
  expect(bytes.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25] };
}

/** The tags of index.html (`LINK` or `META`) as attribute maps. */
const LINK = /<link\s([^>]*?)\/?>/g;
const META = /<meta\s([^>]*?)\/?>/g;
function htmlTags(html: string, pattern: RegExp): Record<string, string>[] {
  return [...html.matchAll(pattern)].map(([, attributes = ""]) =>
    Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
  );
}

const indexHtml = readFileSync(here("../../../index.html"), "utf8");
const links = htmlTags(indexHtml, LINK);
const linkWith = (rel: string, type?: string) =>
  links.find((link) => link.rel === rel && (type === undefined || link.type === type));

/** The page background of each scheme in tokens.css: `--background` on `:root` (light) and in the dark media block. */
const darkAt = tokens.search(/^@media \(prefers-color-scheme: dark\) \{/m);
const BACKGROUND = /--background:\s*(#[0-9a-fA-F]{6});/;
const PAGE_LIGHT = tokens.slice(0, darkAt).match(BACKGROUND)?.[1]?.toLowerCase();
const PAGE_DARK = tokens.slice(darkAt).match(BACKGROUND)?.[1]?.toLowerCase();

describe("US-QS-07 · installable web app and its icon", () => {
  it("US-QS-07 the manifest names the app PflanzenDéx, opens it standalone at the start page and speaks German", () => {
    expect(manifest.name).toBe("PflanzenDéx");
    expect(manifest.short_name).toBe("PflanzenDéx");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("de");
  });

  it("US-QS-25 the manifest's theme colour is the light page background, not the brand green", () => {
    expect(PAGE_LIGHT).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.theme_color).toBe(PAGE_LIGHT);
    expect(manifest.theme_color).not.toBe(BRAND);
  });

  it("US-QS-25 the splash colour (background_color) stays the brand green of the icon", () => {
    expect(BRAND).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.background_color).toBe(BRAND);
  });

  it("US-QS-25 index.html names the page background of each scheme in its theme-color meta, so the status bar follows the page", () => {
    const metas = htmlTags(indexHtml, META).filter((meta) => meta.name === "theme-color");
    const contentFor = (scheme: "light" | "dark") =>
      metas.find((meta) => meta.media === `(prefers-color-scheme: ${scheme})`)?.content;
    expect(metas).toHaveLength(2);
    expect(contentFor("light")).toBe(PAGE_LIGHT);
    expect(contentFor("dark")).toBe(PAGE_DARK);
  });

  it("US-QS-07 the viewport meta lets the on-screen keyboard shrink the layout, so a form's save button stays reachable while typing (issue 1663)", () => {
    const viewport = htmlTags(indexHtml, META).find((meta) => meta.name === "viewport");
    const parts = (viewport?.content ?? "").split(",").map((part) => part.trim());
    expect(parts).toContain("interactive-widget=resizes-content");
    expect(parts).toContain("viewport-fit=cover");
  });

  it("US-QS-07 the manifest lists 192 and 512 px PNG icons for any, a maskable 512 px icon and a monochrome one", () => {
    const withPurpose = (purpose: string, sizes: string) =>
      manifest.icons.filter((icon) => icon.purpose === purpose && icon.sizes === sizes);
    expect(withPurpose("any", "192x192")).toHaveLength(1);
    expect(withPurpose("any", "512x512")).toHaveLength(1);
    expect(withPurpose("maskable", "512x512")).toHaveLength(1);
    expect(withPurpose("monochrome", "512x512")).toHaveLength(1);
    for (const icon of manifest.icons) expect(icon.type).toBe("image/png");
  });

  it("US-QS-07 every icon the manifest names exists and is a PNG of the declared size", () => {
    for (const icon of manifest.icons) {
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(pngInfo(publicFile(icon.src))).toMatchObject({ width, height });
    }
  });

  it("US-QS-07 index.html links the manifest, the SVG favicon, the 32 px favicon and the 180 px Apple touch icon", () => {
    expect(linkWith("manifest")?.href).toBe("/manifest.webmanifest");
    expect(linkWith("icon", "image/svg+xml")?.href).toBe("/favicon.svg");
    expect(linkWith("icon", "image/png")).toMatchObject({
      href: "/favicon-32.png",
      sizes: "32x32",
    });
    expect(linkWith("apple-touch-icon")?.href).toBe("/icons/apple-touch-icon.png");
    for (const href of ["/favicon.svg", "/favicon-32.png", "/icons/apple-touch-icon.png"])
      expect(() => publicFile(href)).not.toThrow();
    expect(pngInfo(publicFile("/icons/apple-touch-icon.png"))).toMatchObject({
      width: 180,
      height: 180,
    });
  });

  it("US-QS-07 the Apple touch icon has no alpha channel, iOS would fill transparent pixels with black", () => {
    const { colourType } = pngInfo(publicFile("/icons/apple-touch-icon.png"));
    expect([0, 2, 3]).toContain(colourType);
  });

  it("US-QS-07 the favicon SVG is the app icon: a square 512 viewBox with the brand green tile", () => {
    const svg = publicFile("/favicon.svg").toString("utf8");
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg.toLowerCase()).toContain(`fill="${BRAND}"`);
  });

  it("US-QS-07 the login theme favicon is the same artwork: an ICO whose 32 px image is the app's favicon-32.png", () => {
    const ico = readFileSync(
      here("../../../../../config/dev/keycloak-theme/pflanzendex/login/resources/img/favicon.ico"),
    );
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const images = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
      const entry = 6 + 16 * i;
      return {
        width: ico.readUInt8(entry) || 256,
        size: ico.readUInt32LE(entry + 8),
        offset: ico.readUInt32LE(entry + 12),
      };
    });
    const image32 = images.find((image) => image.width === 32);
    expect(image32).toBeDefined();
    const png = ico.subarray(image32?.offset ?? 0, (image32?.offset ?? 0) + (image32?.size ?? 0));
    expect(png.equals(publicFile("/favicon-32.png"))).toBe(true);
  });

  it("US-QS-07 the login theme ships the app's SVG favicon and links it after the ICO, so a browser that reads SVG icons shows the same artwork", () => {
    const loginTheme = here("../../../../../config/dev/keycloak-theme/pflanzendex/login/");
    expect(
      readFileSync(new URL("resources/img/favicon.svg", loginTheme)).equals(
        publicFile("/favicon.svg"),
      ),
    ).toBe(true);
    expect(readFileSync(new URL("template.ftl", loginTheme), "utf8")).toContain(
      '<link rel="icon" type="image/svg+xml" href="${url.resourcesPath}/img/favicon.svg" />',
    );
  });

  it("US-QS-07 a motif loses every comment, also one that forms when an inner one goes", async () => {
    const generator = "./build-icons.mjs"; // a Node script without types, so not a static import
    const { innerOf } = (await import(/* @vite-ignore */ generator)) as {
      innerOf: (svg: string) => string;
    };
    expect(innerOf('<svg viewBox="0 0 1 1"><!<!-- a -->-- b --><path d="M0 0"/></svg>')).toBe(
      '<path d="M0 0"/>',
    );
  });
});

describe("US-QS-26 · install sheet and shortcuts of the installed app", () => {
  it("US-QS-26 the manifest describes the app in one German sentence", () => {
    const sentences = manifest.description.split(/[.!?]/u).filter((part) => part.trim() !== "");
    expect(sentences).toHaveLength(1);
    expect(manifest.description).toMatch(/\.$/u);
    expect(manifest.description).toMatch(/\b(und|die|deine)\b/u);
  });

  it("US-QS-26 the manifest names three phone screenshots, in the order and with the files of the screenshot script", () => {
    expect(manifest.screenshots.map((shot) => shot.src)).toEqual(
      screenshotScript.SCREENSHOTS.map((shot) => `/screenshots/${shot.file}`),
    );
    expect(manifest.screenshots).toHaveLength(3);
  });

  it("US-QS-26 every screenshot is a portrait phone picture of 390 x 844 px that exists, with a German label", () => {
    expect(screenshotScript.SIZE).toEqual({ width: 390, height: 844 });
    const labels = manifest.screenshots.map((shot) => shot.label ?? "");
    expect(labels[0]).toMatch(/^Heute: /u);
    expect(labels[1]).toMatch(/^Sammlung: /u);
    expect(labels[2]).toMatch(/^Eine Pflanze: /u);
    for (const shot of manifest.screenshots) {
      expect(shot).toMatchObject({ form_factor: "narrow", sizes: "390x844", type: "image/png" });
      expect(pngInfo(publicFile(shot.src))).toMatchObject({ width: 390, height: 844 });
    }
  });

  it("US-QS-26 the shortcuts are Heute, Gießen and Neue Pflanze, named in German, and the 192 px icon stands for each", () => {
    expect(manifest.shortcuts.map((shot) => shot.name)).toEqual([
      "Heute",
      "Gießen",
      "Neue Pflanze",
    ]);
    expect(manifest.shortcuts.map((shot) => shot.short_name)).toEqual([
      "Heute",
      "Gießen",
      "Neue Pflanze",
    ]);
    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.icons).toHaveLength(1);
      expect(shortcut.icons[0]).toMatchObject({ src: "/icons/icon-192.png", sizes: "192x192" });
      expect(pngInfo(publicFile(shortcut.icons[0]?.src ?? ""))).toMatchObject({ width: 192 });
    }
  });

  it("US-QS-26 every shortcut opens a route the app knows: Heute, Heute with the watering filter and the new-plant flow", () => {
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual([
      PATHS.today,
      WATERING_TASKS_ADDRESS,
      ADD_PLANT_PATH,
    ]);
    const known = [PATHS.today, ADD_PLANT_PATH];
    for (const shortcut of manifest.shortcuts) {
      expect(known).toContain(new URL(shortcut.url, "https://app.invalid").pathname);
    }
  });

  it("US-QS-26 the Gießen shortcut names the watering filter that Heute reads", () => {
    const watering = new URL(manifest.shortcuts[1]?.url ?? "", "https://app.invalid");
    expect(taskFilterOf(watering.searchParams)).toBe("watering");
  });
});
