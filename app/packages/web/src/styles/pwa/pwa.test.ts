// US-QS-07 · Usable on mobile: the installable web app and its icon. Checked without a browser: the manifest, every icon
// file it names, the links of index.html, the favicon SVG and the favicon of the login theme (the same artwork). The look
// of the icons is checked by eye (docs/records) and the installability in Lighthouse and on a phone.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const here = (path: string) => new URL(path, import.meta.url);
const publicFile = (path: string) => readFileSync(here(`./public${path}`));
const PNG_SIGNATURE = "89504e470d0a1a0a";

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  lang: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

const manifest = JSON.parse(publicFile("/manifest.webmanifest").toString("utf8")) as Manifest;

/** The brand green of the icon: `--primary` of the light scheme in the web tokens (the icon's tile and the manifest use it). */
const tokens = readFileSync(here("../tokens.css"), "utf8");
const BRAND = tokens.match(/--primary:\s*(#[0-9a-fA-F]{6});/)?.[1]?.toLowerCase();

/** Width, height and colour type of a PNG (IHDR chunk, RFC 2083). */
function pngInfo(bytes: Buffer) {
  expect(bytes.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25] };
}

/** The `<link>` tags of index.html as attribute maps. */
function htmlLinks(html: string): Record<string, string>[] {
  return [...html.matchAll(/<link\s([^>]*?)\/?>/g)].map(([, attributes = ""]) =>
    Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
  );
}

const links = htmlLinks(readFileSync(here("../../../index.html"), "utf8"));
const linkWith = (rel: string, type?: string) =>
  links.find((link) => link.rel === rel && (type === undefined || link.type === type));

describe("US-QS-07 · installable web app and its icon", () => {
  it("US-QS-07 the manifest names the app PflanzenDéx, opens it standalone at the start page and speaks German", () => {
    expect(manifest.name).toBe("PflanzenDéx");
    expect(manifest.short_name).toBe("PflanzenDéx");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("de");
  });

  it("US-QS-07 theme and background colour are the brand green of the icon, taken from the tokens", () => {
    expect(BRAND).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.theme_color).toBe(BRAND);
    expect(manifest.background_color).toBe(BRAND);
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
