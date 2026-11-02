// US-QS-14: guards for the PflanzenDéx sign-in theme (Gewächshaus split): no external request, self-hosted font, ADR 0017
// tokens shared with the web app, contrast of the text and boundary pairs, German "du" texts, decorative drawing, and the
// same frame content as the welcome page of the web app.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const realm = JSON.parse(
  readFileSync(join(app, "config", "dev", "keycloak", "pflanzendex-realm.json"), "utf8"),
);
const login = join(app, "config", "dev", "keycloak-theme", "pflanzendex", "login");
const read = (...parts) => readFileSync(join(login, ...parts), "utf8");
const template = read("template.ftl");
const css = read("resources", "css", "pflanzendex.css");
const messages = read("messages", "messages_de.properties");
const properties = read("theme.properties");

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Every file the theme ships, recursively (the fonts are binary, the rest text). */
function themeFiles(dir = login) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? themeFiles(path) : [path];
  });
}

/** Colour tokens of a block (the pattern captures its body): `--name: value;` pairs, comments removed, literal values only. */
function tokensOf(source, blockPattern) {
  const block = source.match(blockPattern);
  assert.ok(block, "the token block exists");
  const out = {};
  for (const [, name, value] of block[1]
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    out[name] = value.trim().toLowerCase();
  }
  return out;
}

const webTokens = readFileSync(join(app, "packages", "web", "src", "styles", "tokens.css"), "utf8");
const LIGHT_BLOCK = /:root\s*\{([^}]*)\}/;
const DARK_BLOCK = /@media \(prefers-color-scheme: dark\) \{\s*:root\s*\{([^}]*)\}/;
const webLight = tokensOf(webTokens, LIGHT_BLOCK);
const webDark = tokensOf(webTokens, DARK_BLOCK);
const themeLight = tokensOf(css, LIGHT_BLOCK);
const themeDark = tokensOf(css, DARK_BLOCK);

/** The targets of every `url(...)` in a stylesheet (no quotes, no spaces). */
function cssUrls(text) {
  return text
    .split("url(")
    .slice(1)
    .map((part) => part.split(")")[0].replace(/["']/g, "").trim());
}

/** WCAG 2.x relative luminance and contrast ratio (as in web style-contrast.test.ts). */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SHARED_TOKENS = [
  "background",
  "foreground",
  "card",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "warning",
  "warning-foreground",
  "warning-border",
];

test("US-QS-14: the realm uses the sign-in theme and the theme offers German only (the realm default is de)", () => {
  assert.equal(realm.loginTheme, "pflanzendex");
  assert.equal(realm.defaultLocale, "de");
  assert.match(properties, /^locales=de$/m, "one locale: no language dropdown on the card");
  assert.match(properties, /^parent=keycloak\.v2$/m);
  assert.doesNotMatch(
    template,
    /login-select-toggle|languages/,
    "the template has no language selector",
  );
});

test("US-QS-14: the theme makes no external request (fonts, images, styles and scripts come from the server)", () => {
  for (const file of themeFiles().filter((f) => /\.(ftl|css|properties|svg|js)$/.test(f))) {
    const text = readFileSync(file, "utf8");
    for (const [url] of text.matchAll(/https?:\/\/[^\s"'<>)]*/g)) {
      assert.ok(url.startsWith(SVG_NAMESPACE), `${relative(login, file)} links ${url}`);
    }
    assert.doesNotMatch(
      text,
      /(?:src|href)=["']\/\//,
      `${relative(login, file)} has a protocol-relative link`,
    );
    assert.ok(
      !/@import[^;]*https?:/.test(text) && !/@import[^;]*\/\//.test(text),
      `${relative(login, file)} imports a style from outside`,
    );
  }
  for (const target of cssUrls(css)) {
    assert.ok(!target.startsWith("http") && !target.startsWith("//"), `${target} is relative`);
    assert.ok(
      existsSync(join(login, "resources", "css", target)),
      `${target} ships with the theme`,
    );
  }
});

test("US-QS-14: the Figtree font is self-hosted as WOFF2 and its licence ships with it", () => {
  const font = join(login, "resources", "fonts", "figtree-latin-wght-normal.woff2");
  assert.ok(existsSync(font), "the font file ships with the theme");
  assert.equal(readFileSync(font).subarray(0, 4).toString("latin1"), "wOF2", "valid WOFF2 header");
  assert.match(css, /font-family:\s*"Figtree"/);
  assert.match(css, /url\("\.\.\/fonts\/figtree-latin-wght-normal\.woff2"\)\s*format\("woff2"\)/);
  assert.match(read("resources", "fonts", "ofl.txt"), /SIL OPEN FONT LICENSE/i);
});

test("US-QS-14: the theme colours are the ADR 0017 tokens of the web app, light and dark", () => {
  for (const name of SHARED_TOKENS) {
    assert.ok(webLight[name], `web token --${name} exists`);
    assert.equal(themeLight[name], webLight[name], `light --${name} equals the web token`);
    assert.equal(themeDark[name], webDark[name], `dark --${name} equals the web token`);
  }
});

test("US-QS-14: text meets 4.5:1 and the boundaries and focus 3:1 on every surface the frame uses, light and dark", () => {
  const pairs = [
    ["foreground", "background", 4.5],
    ["foreground", "card", 4.5],
    ["foreground", "muted", 4.5],
    ["muted-foreground", "background", 4.5],
    ["muted-foreground", "card", 4.5],
    ["muted-foreground", "muted", 4.5],
    ["primary-foreground", "primary", 4.5],
    ["primary", "background", 4.5],
    ["primary", "card", 4.5],
    ["accent-foreground", "accent", 4.5],
    ["destructive", "card", 4.5],
    ["input", "card", 3],
    ["input", "background", 3],
    ["ring", "background", 3],
    ["warning-foreground", "warning", 4.5],
    ["warning-border", "warning", 3],
    ["primary", "muted", 3],
  ];
  for (const [scheme, tokens] of [
    ["light", themeLight],
    ["dark", themeDark],
  ]) {
    for (const [text, surface, min] of pairs) {
      const ratio = contrast(tokens[text], tokens[surface]);
      assert.ok(
        ratio >= min,
        `${scheme}: --${text} on --${surface} is ${ratio.toFixed(2)}:1, needs ${min}:1`,
      );
    }
  }
});

test("US-QS-14: the fields are 48 px high and the boundary of a field is the input token, the focus ring is visible", () => {
  assert.match(css, /\.pf-v5-c-form-control\s*\{[^}]*min-height:\s*48px/);
  assert.match(css, /\.pf-v5-c-button\.pf-m-primary[^{]*\{[^}]*min-height:\s*48px/);
  assert.match(css, /\.pf-v5-c-form-control\s*\{[^}]*border:\s*1px solid var\(--input\)/);
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  assert.match(
    css,
    /\.pf-v5-c-form-control:focus-within\s*\{[^}]*outline:\s*2px solid var\(--ring\)/,
  );
});

test("US-QS-14: reduced motion and forced colours are respected by the stylesheet", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.doesNotMatch(css, /animation\s*:/, "the frame has no animation to run");
});

test("US-QS-14: the German texts use the du form in the overridden messages and carry the sign-in wording", () => {
  const values = Object.fromEntries(
    messages
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
  assert.equal(values.doLogIn, "Melde dich an");
  assert.equal(values.usernameOrEmail, "E-Mail oder Benutzername");
  assert.equal(values.doRegister, "Konto anlegen");
  assert.equal(values.loginTitleHtml, "PflanzenDéx");
  for (const [key, value] of Object.entries(values)) {
    assert.doesNotMatch(
      value,
      /\b(Sie|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres|Ihnen)\b/,
      `${key} does not use the formal address`,
    );
  }
});

test("US-QS-14: the registration link on the sign-in page is an outline button below the text of the filled sign-in button", () => {
  assert.match(css, /#kc-registration span\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /#kc-registration a\s*,?[^{]*\{[^}]*border:\s*1px solid var\(--primary\)/);
  assert.match(css, /#kc-registration a[^{]*\{[^}]*border-radius:\s*var\(--radius-pill\)/);
});

test("US-QS-14: the drawing is decorative and the value lines are text", () => {
  const svg = template.match(/<svg class="pdx-drawing"[^>]*>/);
  assert.ok(svg, "the drawing is inline");
  assert.match(svg[0], /aria-hidden="true"/);
  assert.match(template, /<ul class="pdx-values">\s*<li>\$\{msg\("pdxValue1"\)\}<\/li>/);
  for (const key of ["pdxValue1", "pdxValue2", "pdxValue3"]) {
    assert.ok(
      messages.split("\n").some((line) => line.startsWith(`${key}=`)),
      `${key} has a German text`,
    );
  }
});

test("US-QS-14: the drawing and the three value lines of the sign-in theme equal the welcome page of the web app", () => {
  const webFrame = readFileSync(
    join(app, "packages", "web", "src", "account", "views", "auth-frame", "auth-frame.tsx"),
    "utf8",
  );
  const paths = (text) => [...text.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(paths(webFrame), paths(template), "the same drawing paths in both frames");
  const lines = [...messages.matchAll(/^pdxValue\d=(.+)$/gm)].map((m) => m[1]);
  for (const line of lines) {
    assert.ok(webFrame.includes(`"${line}"`), `the welcome page shows "${line}"`);
  }
  assert.equal(lines.length, 3);
});
