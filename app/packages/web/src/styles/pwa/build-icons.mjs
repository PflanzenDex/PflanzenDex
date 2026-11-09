#!/usr/bin/env node
// US-QS-07 · The icon set of the installable web app. One motif (motifs/<name>.svg) and two brand colours of the tokens
// (styles/tokens.css: --primary is the tile, --primary-foreground the motif) generate every icon file:
//   public/favicon.svg, favicon-32.png, icons/ (any 192 and 512, maskable 512, monochrome 512, Apple touch 180)
//   the login theme's favicons (config/dev/keycloak-theme/…/img/: favicon.ico with 16, 32 and 48 px, favicon.svg)
// Usage: npm run icons -w @pflanzendex/web              the motif of DEFAULT_MOTIF
//        npm run icons -w @pflanzendex/web -- sprout    another motif: the swap is this one step
// The motif is scaled and centred by its bounding box, so every motif has the same visual size. The manifest
// (public/manifest.webmanifest) is written by hand; pwa.test.ts checks its colours against the tokens.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = import.meta.dirname;
const PUBLIC = path.join(HERE, "public");
const KEYCLOAK_IMG = path.join(
  HERE,
  "../../../../../config/dev/keycloak-theme/pflanzendex/login/resources/img",
);
const TOKENS = readFileSync(path.join(HERE, "../tokens.css"), "utf8");
export const MOTIFS = {
  sprout: readFileSync(path.join(HERE, "motifs/sprout.svg"), "utf8"),
  pot: readFileSync(path.join(HERE, "motifs/pot.svg"), "utf8"),
  rosette: readFileSync(path.join(HERE, "motifs/rosette.svg"), "utf8"),
};
/** Recommended: it reads as a plant at 16 px and matches the shelf of pots on the sign-in page (US-QS-14). */
export const DEFAULT_MOTIF = "pot";

const CANVAS = 512;
const GLYPH_SPAN = 336; // the motif spans 66 % of the side in the "any" icon (starting value, assumption)
const MASKABLE_SCALE = 0.85; // maskable and monochrome: the motif shrinks around the centre into the safe zone
const SAFE_RADIUS = CANVAS * 0.4; // maskable safe zone: a circle of 80 % of the side

/** A colour of tokens.css; the pattern captures its hex value. */
function token(pattern) {
  const hex = TOKENS.match(pattern)?.[1];
  if (!hex) throw new Error(`tokens.css has no colour for ${pattern.source}`);
  return hex.toLowerCase();
}
const TILE = token(/--primary:\s*(#[0-9a-fA-F]{6});/);
const GLYPH = token(/--primary-foreground:\s*(#[0-9a-fA-F]{6});/);

/** The markup inside a motif file: its shapes without the <svg> element and without comments. */
export function innerOf(svg) {
  const start = svg.indexOf(">", svg.indexOf("<svg")) + 1;
  let inner = svg.slice(start, svg.lastIndexOf("</svg>"));
  let before;
  do {
    before = inner;
    inner = inner.replace(/<!--[\s\S]*?-->/g, ""); // again: removing one comment can form the next
  } while (inner !== before);
  return inner;
}

const svgDocument = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">${body}</svg>`;

async function rasterize(svg) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** [x, y] of every pixel that is not transparent. */
function* coveredPixels({ data, width, height }) {
  for (let i = 0; i < width * height; i++)
    if (data[i * 4 + 3] > 0) yield [i % width, Math.floor(i / width)];
}

/** Scale and centre of a motif: its bounding box spans GLYPH_SPAN and its centre moves to the middle of the canvas. */
async function fitOf(motifSvg) {
  const raster = await rasterize(svgDocument(`<g fill="#000000">${innerOf(motifSvg)}</g>`));
  let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
  for (const [x, y] of coveredPixels(raster)) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (x1 < 0) throw new Error("the motif draws nothing");
  const span = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  return { scale: GLYPH_SPAN / span, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}

/** The fitted motif moved to the centre and scaled by `factor` around it. */
const placed = ({ scale, cx, cy }, factor = 1) =>
  `translate(${CANVAS / 2} ${CANVAS / 2}) scale(${scale * factor}) translate(${-cx} ${-cy})`;

const motifGroup = (motifSvg, transform, fill) =>
  `<g transform="${transform}" fill="${fill}">${innerOf(motifSvg)}</g>`;

/** Every pixel with paint lies inside the maskable safe zone; otherwise the motif is too large for MASKABLE_SCALE. */
async function assertInSafeZone(svg) {
  for (const [x, y] of coveredPixels(await rasterize(svg)))
    if (Math.hypot(x + 0.5 - CANVAS / 2, y + 0.5 - CANVAS / 2) > SAFE_RADIUS)
      throw new Error(`the motif leaves the maskable safe zone at ${x},${y}; lower MASKABLE_SCALE`);
}

/** The artworks of one motif as SVG markup: the full icon (tile and motif), the maskable one and the monochrome one. */
export async function artwork(motifSvg) {
  const fit = await fitOf(motifSvg);
  const tile = `<rect width="${CANVAS}" height="${CANVAS}" fill="${TILE}"/>`;
  const monochrome = svgDocument(motifGroup(motifSvg, placed(fit, MASKABLE_SCALE), "#000000"));
  await assertInSafeZone(monochrome);
  return {
    any: svgDocument(tile + motifGroup(motifSvg, placed(fit), GLYPH)),
    maskable: svgDocument(tile + motifGroup(motifSvg, placed(fit, MASKABLE_SCALE), GLYPH)),
    monochrome,
  };
}

/** A PNG of an artwork at `size` px; `opaque` drops the alpha channel (iOS fills transparent pixels with black). */
export function png(svg, size, { opaque = false } = {}) {
  const image = sharp(Buffer.from(svg), { density: 72 }).resize(size, size);
  return (opaque ? image.flatten({ background: TILE }) : image)
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
}

/** An ICO file that holds PNG images ([{ size, png }], Windows Vista and later, every browser). */
export function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // type 1: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png: data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size % 256, entry); // 256 px is written as 0
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

async function main() {
  const requested = process.argv[2] ?? DEFAULT_MOTIF;
  const motif = MOTIFS[requested];
  if (!motif)
    throw new Error(`no motif "${requested}": use one of ${Object.keys(MOTIFS).join(", ")}`);
  const { any, maskable, monochrome } = await artwork(motif);
  mkdirSync(path.join(PUBLIC, "icons"), { recursive: true });
  writeFileSync(path.join(PUBLIC, "favicon.svg"), any);
  writeFileSync(path.join(PUBLIC, "favicon-32.png"), await png(any, 32));
  writeFileSync(path.join(PUBLIC, "icons/icon-192.png"), await png(any, 192));
  writeFileSync(path.join(PUBLIC, "icons/icon-512.png"), await png(any, 512));
  writeFileSync(path.join(PUBLIC, "icons/icon-maskable-512.png"), await png(maskable, 512));
  writeFileSync(path.join(PUBLIC, "icons/icon-monochrome-512.png"), await png(monochrome, 512));
  writeFileSync(
    path.join(PUBLIC, "icons/apple-touch-icon.png"),
    await png(any, 180, { opaque: true }),
  );
  const sizes = [16, 32, 48];
  const images = await Promise.all(
    sizes.map(async (size) => ({ size, png: await png(any, size) })),
  );
  writeFileSync(path.join(KEYCLOAK_IMG, "favicon.ico"), ico(images));
  writeFileSync(path.join(KEYCLOAK_IMG, "favicon.svg"), any);
  console.log(
    `icons: motif "${requested}", tile ${TILE}, motif colour ${GLYPH}, written to ${PUBLIC}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
