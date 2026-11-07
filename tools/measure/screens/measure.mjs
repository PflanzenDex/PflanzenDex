// Measures screens of the one-screen register at the window sizes of US-QS-15 (US-QG-01, issue 1199): for each screen
// and size the page ratio, the largest inner scroll region, the overflow in pixels as the gate counts it, sideways
// overflow and the painted width (for the 1920 px cap). A local helper before pushing; the CI job `results` (its one-screen part) stays
// the reference.
//
// Usage: node tools/measure/screens/measure.mjs [options] [id[@WxH] ...]
//   no ids        every screen of the register
//   id@WxH        one screen at one size; a bare id takes --sizes
//   --sizes=a,b   sizes (default: the six of US-QS-15)
//   --dark        dark colour scheme
//   --text=200    text size in percent (the 200 % case of #1019)
//   --user=test3  measure as another demo account than the register names
//   --out=dir     write results.json there, and screenshots with --shots
//   --shots       screenshots of every measurement into <out>/shots
import { mkdirSync, writeFileSync } from "node:fs";
import { SIZES, chromium, openScreen, register, screenContext, sessions } from "../lib.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
};
const sizes = String(option("sizes", SIZES.join(","))).split(",");
const dark = option("dark", false) === true;
const text = Number(option("text", 100));
const userOverride = option("user", undefined);
const out = option("out", undefined);
const shots = option("shots", false) === true && out;

const screens = register();
const wanted = args.filter((a) => !a.startsWith("--"));
const targets = (wanted.length ? wanted : screens.map((s) => s.id)).flatMap((t) => {
  const [id, size] = t.split("@");
  const screen = screens.find((s) => s.id === id);
  if (!screen) {
    console.error(`${id}: not in the register`);
    return [];
  }
  return (size ? [size] : sizes).map((sz) => ({ screen, size: sz }));
});

/** Runs in the page: the numbers of one measurement. Regions under 80 px are left out, as in the gate. */
function measurePage() {
  const doc = document.scrollingElement || document.documentElement;
  const regions = [];
  for (const el of document.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    if (
      !/(auto|scroll)/.test(style.overflowY) ||
      el.clientHeight < 80 ||
      !el.getClientRects().length
    )
      continue;
    const overflow = el.scrollHeight - el.clientHeight;
    if (overflow > 0)
      regions.push({
        px: overflow,
        ratio: el.scrollHeight / el.clientHeight,
        el: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`,
      });
  }
  regions.sort((a, b) => b.px - a.px);
  // The painted width: the union of boxes that draw something (text, media, controls, a background or a border).
  let left = Infinity;
  let right = -Infinity;
  const pageBackground = getComputedStyle(document.body).backgroundColor;
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("[aria-hidden='true']")) continue;
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0)
      continue;
    const paints =
      /^(IMG|SVG|INPUT|SELECT|TEXTAREA|BUTTON|VIDEO|CANVAS)$/i.test(el.tagName) ||
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) ||
      (style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== pageBackground) ||
      ["Top", "Right", "Bottom", "Left"].some(
        (k) => parseFloat(style[`border${k}Width`]) > 0 && style[`border${k}Style`] !== "none",
      );
    if (!paints) continue;
    left = Math.min(left, box.left);
    right = Math.max(right, box.right);
  }
  return {
    page: +(doc.scrollHeight / innerHeight).toFixed(2),
    pagePx: doc.scrollHeight - innerHeight,
    inner: regions.length ? +regions[0].ratio.toFixed(2) : 1,
    innerPx: regions.length ? regions[0].px : 0,
    innerEl: regions.length ? regions[0].el : "",
    sideways: Math.max(0, doc.scrollWidth - innerWidth),
    painted: [Math.round(left), Math.round(right)],
    url: location.pathname + location.search,
  };
}

const browser = await chromium.launch();
const signIn = sessions(browser);
const results = [];
if (shots) mkdirSync(`${out}/shots`, { recursive: true });
for (const { screen, size } of targets) {
  const row = { id: screen.id, size, dark, text };
  const context = await screenContext(
    browser,
    await signIn(userOverride ?? screen.account ?? "test2"),
    size,
    dark,
  );
  const page = await context.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => undefined));
  try {
    await openScreen(page, screen, text);
    Object.assign(row, await page.evaluate(measurePage));
    if (shots) await page.screenshot({ path: `${out}/shots/${screen.id}@${size}.png` });
  } catch (error) {
    row.error = String(error.message).split("\n")[0].slice(0, 160);
  }
  await context.close();
  results.push(row);
  const over = row.error
    ? `ERROR ${row.error}`
    : `page ${row.page} (${row.pagePx} px), inner ${row.inner} (${row.innerPx} px ${row.innerEl}), sideways ${row.sideways} px, painted ${row.painted.join("..")}`;
  console.log(`${screen.id}@${size}: ${over}`);
}
await browser.close();
if (out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
}
const bad = results.filter((r) => r.error || r.pagePx > 1 || r.innerPx > 1 || r.sideways > 0);
console.log(
  `\n${results.length} measurements, ${bad.length} over the gate's 1 px tolerance or failed`,
);
