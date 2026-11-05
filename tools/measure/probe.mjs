// Shows why one screen does not fit (US-QG-01, issue 1199): every scroll region with its overflow, and below the ones
// that overflow the tree of their children with top, height and width, so the part that takes the room stands out.
//
// Usage: node tools/measure/probe.mjs <id>@<WxH> [--dark] [--text=200] [--user=test3] [--depth=7] [--shot=file.png]
import {
  chromium,
  openScreen,
  register,
  screenContext,
  sessions,
} from "./lib.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
};
const [target] = args.filter((a) => !a.startsWith("--"));
if (!target) {
  console.error(
    "usage: node tools/measure/probe.mjs <id>@<WxH> [--dark] [--text=200] [--user=…] [--depth=7] [--shot=file.png]",
  );
  process.exit(2);
}
const [id, size = "360x640"] = target.split("@");
const screen = register().find((s) => s.id === id);
if (!screen) {
  console.error(`${id}: not in the register`);
  process.exit(2);
}

const browser = await chromium.launch();
const signIn = sessions(browser);
const context = await screenContext(
  browser,
  await signIn(option("user", screen.account ?? "test2")),
  size,
  option("dark", false) === true,
);
const page = await context.newPage();
await openScreen(page, screen, Number(option("text", 100)));
const report = await page.evaluate(
  (depth) => {
    const lines = [location.pathname + location.search];
    const name = (el) =>
      `${el.tagName.toLowerCase()}${el.hasAttribute("data-layer-body") ? "[layer-body]" : ""}.${String(el.className).slice(0, 110)}`;
    const walk = (el, level) => {
      if (level > depth) return;
      for (const child of el.children) {
        const box = child.getBoundingClientRect();
        lines.push(
          `${"  ".repeat(level)}${Math.round(box.top)}+${Math.round(box.height)} w=${Math.round(box.width)} ${name(child)}`,
        );
        walk(child, level + 1);
      }
    };
    for (const el of document.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (
        !/(auto|scroll)/.test(style.overflowY) ||
        !el.getClientRects().length ||
        el.clientHeight < 40
      )
        continue;
      const overflow = el.scrollHeight - el.clientHeight;
      lines.push(
        `SCROLL ${overflow} px (${(el.scrollHeight / el.clientHeight).toFixed(2)}) client=${el.clientHeight} ${name(el)}`,
      );
      if (overflow > 1) walk(el, 1);
    }
    return lines.join("\n");
  },
  Number(option("depth", 7)),
);
console.log(report);
const shot = option("shot", undefined);
if (shot) await page.screenshot({ path: shot });
await browser.close();
