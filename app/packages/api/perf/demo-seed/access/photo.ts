import sharp from "sharp";

// Placeholder photo: a small generated PNG (a soft green gradient with a leaf-like ellipse), never a foreign image.
export async function placeholderPhoto(seed: number): Promise<Uint8Array> {
  const hue = 90 + ((seed * 23) % 70);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480">
    <rect width="360" height="480" fill="hsl(${hue},30%,88%)"/>
    <rect y="340" width="360" height="140" fill="hsl(25,35%,38%)"/>
    <ellipse cx="180" cy="${230 - (seed % 5) * 8}" rx="${90 + (seed % 4) * 10}" ry="${60 + (seed % 3) * 12}" fill="hsl(${hue},55%,35%)"/>
  </svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}
