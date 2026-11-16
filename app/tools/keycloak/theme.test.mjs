// US-QS-14: guards for the PflanzenDéx sign-in theme (Gewächshaus split): no external request, self-hosted font, ADR 0017
// tokens shared with the web app, contrast of the text and boundary pairs, German "du" texts, decorative drawing, and the
// same frame content as the welcome page of the web app.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  assert.equal(values.doLogIn, "Anmelden");
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

test("US-QS-15: the sign-in page is one screen (NFR-13, DS-61): the page is the viewport, its form column scrolls inside it", () => {
  assert.match(css, /\.pdx-page\s*\{[^}]*height:\s*100dvh/);
  assert.doesNotMatch(
    css,
    /\.pdx-page\s*\{[^}]*min-height/,
    "the page does not grow with its content",
  );
  assert.match(css, /\.pdx-page\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(css, /\.pdx-content\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.pdx-side\s*\{[^}]*overflow-y:\s*auto/, "the wide panel scrolls inside too");
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

test('US-QS-32 · Q-44: the sign-in theme marks its page as not to translate (translate="no" on html, google notranslate meta)', () => {
  const htmlLine = template.split("\n").find((line) => line.startsWith("<html ")) ?? "";
  assert.match(htmlLine, /\stranslate="no"/, 'the html element carries translate="no"');
  assert.match(template, /<meta name="google" content="notranslate">/);
});

// US-DEV-06, #2161: Keycloak serves a theme file for 30 days (cache-control max-age) under a URL whose resources version
// belongs to the container, not to the file. The stylesheet link therefore carries a content version (`?v=`, the first 12
// hex digits of the sha256 of css/pflanzendex.css). A changed stylesheet needs a new value here, or browsers keep the old one.
test("US-DEV-06 #2161: the stylesheet link carries the content version of css/pflanzendex.css (a changed stylesheet needs a new ?v=)", () => {
  const digest = createHash("sha256")
    .update(readFileSync(join(login, "resources", "css", "pflanzendex.css")))
    .digest("hex")
    .slice(0, 12);
  const expected = `css/pflanzendex.css?v=${digest}`;
  const styles = properties.match(/^styles=(.*)$/m)?.[1]?.split(" ") ?? [];
  assert.ok(
    styles.includes(expected),
    `theme.properties must name styles=css/styles.css ${expected} (the content version of css/pflanzendex.css); it names: ${styles.join(" ") || "nothing"}`,
  );
});

// US-QS-32 (design review FX-50, issues 2030 to 2033): the sign-in pages and the Keycloak e-mails speak "du", name the product
// PflanzenDéx, and every refusal says how to go on. The base theme (Keycloak 26.8) is not in the repo: the keys below are the
// ones a sign-up, sign-in, reset, password or verify page can show in this realm (password policy, user profile, e-mail).
const FORMAL = /\b(Sie|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres|Ihnen)\b/;
const EMAIL_THEME = join(app, "config", "dev", "keycloak-theme", "pflanzendex", "email");
const valuesOf = (text) =>
  Object.fromEntries(
    text
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
const de = valuesOf(messages);
// Read per test: a missing e-mail file fails the e-mail tests only, not the file.
const emailDe = () =>
  valuesOf(readFileSync(join(EMAIL_THEME, "messages", "messages_de.properties"), "utf8"));
/** A du imperative or the page's own link name: the way on that a refusal must name (SG-COPY-06, SG-FORM-05). */
const WAY_ON =
  /\b(Prüfe|Gib|Wähle|Melde|Setz|Kürze|Warte|Entferne|Fang|Lege|Versuch|Kehr|Führe|Bestätige|Ändere|Geh)\b|Passwort vergessen/;

test("US-QS-32 · F-0317: the sign-in button and the sign-in title carry one name, Anmelden", () => {
  assert.equal(de.doLogIn, "Anmelden");
  assert.equal(de.loginTitle, "Anmelden");
});

test("US-QS-32 · F-0318: a refused sign-in names both fields and the reset link, the way on (above the fields, the alert is rendered before the form)", () => {
  assert.equal(
    de.invalidUserMessage,
    "E-Mail, Benutzername oder Passwort stimmen nicht. Prüfe beides oder setz dein Passwort über „Passwort vergessen?“ zurück.",
  );
  assert.equal(
    de.doForgotPassword,
    "Passwort vergessen?",
    "the link the message names is the link of the form",
  );
  assert.ok(
    template.indexOf('<div class="${properties.kcAlertClass!} pf-m-${') <
      template.indexOf('<#nested "form">'),
    "the alert stands before the form",
  );
});

test("US-QS-32 · F-0318 · F-0375: a locked-out sign-in says how to go on (waiting, the reset link)", () => {
  assert.match(de.accountTemporarilyDisabledMessage, /Warte/);
  assert.match(de.accountTemporarilyDisabledMessage, /Passwort vergessen\?/);
});

test("US-QS-32 · F-0321: the reset page explains its button above its field in one line, the other pages keep the info in the footer", () => {
  // pageId is the template name without ".ftl" (FreeMarkerLoginFormsProvider.processTemplate, Keycloak 26.8.1).
  const block = '<#if displayInfo && pageId == "login-reset-password">';
  const start = template.indexOf(block);
  const form = template.indexOf('<#nested "form">');
  assert.ok(start >= 0, "the reset page has its own block");
  assert.ok(start < form, "the block stands before the form");
  assert.ok(template.slice(start, form).includes('<#nested "info">'), "the info is rendered there");
  assert.match(template, /<#if displayInfo && pageId != "login-reset-password">/);
  assert.ok(template.indexOf('<#nested "info">', form) > form, "the other pages keep the footer");
  assert.equal(de.emailInstruction, "Wir schicken dir einen Link zum Zurücksetzen.");
  assert.equal(de.emailInstructionUsername, "Wir schicken dir einen Link zum Zurücksetzen.");
});

test("US-QS-32 · F-0322: the reset page names an empty field as its label does, the sign-up keeps the user name text", () => {
  const field = read("field.ftl");
  assert.match(field, /pageId == "login-reset-password"/);
  assert.match(field, /msg\("missingUsernameMessage"\)/);
  assert.match(field, /msg\("pdxResetMissingUsername"\)/);
  assert.equal(
    de.pdxResetMissingUsername,
    "Gib deine E-Mail-Adresse oder deinen Benutzernamen ein.",
  );
  assert.equal(de.missingUsernameMessage, "Bitte gib einen Benutzernamen ein.");
});

test("US-QS-32 · issue 2214: the reset page never fills its field from the last sign-in attempt, so the keeper names the account", () => {
  const field = read("field.ftl");
  const input = field.slice(
    field.indexOf("<#macro input "),
    field.indexOf("</#macro>", field.indexOf("<#macro input ")),
  );
  const blank = input.indexOf('<#if pageId == "login-reset-password" && name == "username">');
  assert.ok(blank > 0, "the input macro clears the reset page's user name field");
  assert.match(input.slice(blank), /^<#if [^>]+>\s*<#local value = "">\s*<\/#if>/);
  assert.ok(
    blank < input.indexOf('value="${value}"'),
    "the value is cleared before the field is rendered",
  );
  // No theme template may bring the attempted user name back onto the reset page.
  assert.equal(
    existsSync(join(login, "login-reset-password.ftl")),
    false,
    "keycloak.v2 renders the reset page itself",
  );
  // An empty field is refused by Keycloak with missingUsernameMessage, which the reset page shows as its own text.
  assert.equal(
    de.pdxResetMissingUsername,
    "Gib deine E-Mail-Adresse oder deinen Benutzernamen ein.",
  );
});

test("US-QS-32 · F-0321 · F-0322: no page id in the theme carries .ftl (Keycloak's pageId is the template name without it)", () => {
  for (const file of [template, read("field.ftl")]) {
    assert.doesNotMatch(file, /pageId\s*[=!]=\s*"[^"]*\.ftl"/);
  }
});

test("US-QS-32 · F-0326: doClickHere is shared by the verify-email and the page-expired pages, so it names no page result; the verify sentence continues the link with ', um'", () => {
  // The base page-expired template uses doClickHere for its restart and continue links (pageExpiredMsg1/2), so a result such
  // as "E-Mail erneut senden" would label the wrong action there.
  assert.notEqual(
    de.doClickHere,
    "Hier klicken",
    "the base default names no result either, but is replaced",
  );
  assert.doesNotMatch(
    de.doClickHere,
    /E-Mail|Anmeldung|Passwort|senden|erneut/,
    "no page result in the shared text",
  );
  assert.equal(de.emailVerifyInstruction2, "Keine E-Mail bekommen?");
  assert.match(
    de.emailVerifyInstruction3,
    /^, um dir eine neue E-Mail schicken zu lassen\.$/,
    "the sentence continues the link",
  );
  assert.equal(de.backToLogin, "Zurück zur Anmeldung");
  assert.equal(de.backToApplication, "Zurück zur App");
  assert.equal(de.updatePasswordMessage, "Lege ein Passwort fest, um dein Konto zu aktivieren.");
});

test("US-QS-32 · F-0330: page text blocks wrap an unbroken e-mail address at 200 % text", () => {
  assert.match(
    css,
    /\.instruction[^{]*\.pf-v5-c-alert__title[^{]*\{[^}]*overflow-wrap:\s*anywhere/,
    "the instruction and the alert title wrap anywhere",
  );
});

test("US-QS-32 · F-0324: every sign-up validation message is in the du form and says how to fix the field", () => {
  for (const key of [
    "error-user-attribute-required",
    "error-invalid-blank",
    "error-empty",
    "error-invalid-email",
    "error-invalid-length",
    "error-invalid-length-too-short",
    "error-invalid-length-too-long",
    "error-pattern-no-match",
    "error-username-invalid-character",
    "error-person-name-invalid-character",
    "error-invalid-value",
  ]) {
    assert.ok(key in de, `${key} is overridden by the theme`);
    assert.doesNotMatch(de[key], FORMAL, `${key} does not use the formal address`);
    assert.doesNotMatch(de[key], /\{0\}/, `${key} names no attribute placeholder`);
  }
  assert.equal(de["error-user-attribute-required"], "Bitte fülle dieses Feld aus.");
  assert.match(de["error-invalid-length"], /\{1\}.*\{2\}/, "the length keeps both bounds");
  assert.match(de["error-invalid-length-too-short"], /\{1\}/);
  assert.match(de["error-invalid-length-too-long"], /\{2\}/);
});

test("US-QS-32 · F-0375: every refusal of the sign-up and the password says how to go on, and keeps its placeholder", () => {
  for (const key of [
    "emailExistsMessage",
    "usernameExistsMessage",
    "invalidEmailMessage",
    "notMatchPasswordMessage",
    "invalidPasswordConfirmMessage",
    "invalidPasswordMinLengthMessage",
    "invalidPasswordMaxLengthMessage",
    "invalidPasswordNotUsernameMessage",
    "invalidPasswordNotEmailMessage",
    "invalidPasswordNotContainsUsernameMessage",
    "invalidPasswordGenericMessage",
  ]) {
    assert.ok(key in de, `${key} is overridden by the theme`);
    assert.doesNotMatch(de[key], FORMAL, `${key} does not use the formal address`);
    assert.match(de[key], WAY_ON, `${key} names the way on`);
  }
  assert.match(
    de.emailExistsMessage,
    /Melde dich damit an/,
    "the e-mail refusal offers the sign-in",
  );
  assert.match(de.emailExistsMessage, /Passwort vergessen\?/, "and the reset");
  assert.match(de.invalidPasswordMinLengthMessage, /\{0\}/);
  assert.match(de.invalidPasswordMaxLengthMessage, /\{0\}/);
});

test("US-QS-32 · F-0324 · F-0375: the messages of the sign-in and the sign-up keep the du form (the whole overridden file, no formal address)", () => {
  for (const [key, value] of Object.entries(de)) {
    assert.doesNotMatch(value, FORMAL, `${key} does not use the formal address`);
  }
});

test("US-QS-32 · F-0376: the e-mail theme is the du theme of the product, parent base, German only", () => {
  const properties = readFileSync(join(EMAIL_THEME, "theme.properties"), "utf8");
  assert.match(properties, /^parent=base$/m);
  assert.match(properties, /^locales=de$/m);
  assert.ok(existsSync(join(EMAIL_THEME, "messages", "messages_de.properties")));
});

test("US-QS-32 · F-0376: every e-mail text is in the du form", () => {
  for (const [key, value] of Object.entries(emailDe())) {
    assert.doesNotMatch(value, FORMAL, `${key} does not use the formal address`);
  }
});

test("US-QS-32 · F-0376: the e-mails name the product PflanzenDéx, never the realm placeholder {2} and never the old spelling", () => {
  for (const value of Object.values(emailDe())) {
    assert.doesNotMatch(value, /PflanzenDex/, "the old spelling is not used");
  }
  // The mails whose base text names the realm with {2}: the product stands there as text. (In the credential mails {2} is the
  // IP address, in the identity link mail the user; those keep their placeholders.)
  for (const key of [
    "emailVerificationBody",
    "emailVerificationBodyHtml",
    "emailUpdateConfirmationBody",
    "emailUpdateConfirmationBodyHtml",
    "passwordResetBody",
    "passwordResetBodyHtml",
    "executeActionsBody",
    "executeActionsBodyHtml",
    "verifiableCredentialOfferBody",
    "verifiableCredentialOfferBodyHtml",
  ]) {
    assert.doesNotMatch(emailDe()[key], /\{2\}/, `${key} does not use the realm placeholder {2}`);
  }
  assert.match(
    emailDe().eventRemoveCredentialBody,
    /\{2\}/,
    "the credential mail keeps its IP address {2}",
  );
  assert.match(
    emailDe().identityProviderLinkBody,
    /\{2\}/,
    "the identity link mail keeps the user {2}",
  );
  for (const key of [
    "emailVerificationBody",
    "emailVerificationBodyHtml",
    "emailUpdateConfirmationBody",
    "emailUpdateConfirmationBodyHtml",
    "passwordResetBody",
    "passwordResetBodyHtml",
    "executeActionsBody",
    "executeActionsBodyHtml",
  ]) {
    assert.match(emailDe()[key], /PflanzenDéx/, `${key} names the product`);
  }
});

test("US-QS-32 · F-0376: every mail with a link keeps its link placeholder {0}, and the link text names its result", () => {
  for (const key of [
    "emailVerificationBody",
    "emailVerificationBodyHtml",
    "emailUpdateConfirmationBody",
    "emailUpdateConfirmationBodyHtml",
    "passwordResetBody",
    "passwordResetBodyHtml",
    "executeActionsBody",
    "executeActionsBodyHtml",
    "verifiableCredentialOfferBody",
    "verifiableCredentialOfferBodyHtml",
    "orgInviteBody",
    "orgInviteBodyHtml",
    "orgInviteBodyPersonalized",
    "orgInviteBodyPersonalizedHtml",
  ]) {
    assert.match(emailDe()[key], /\{0\}/, `${key} keeps the link {0}`);
  }
  assert.match(emailDe().identityProviderLinkBodyHtml, /\{3\}/, "the identity link keeps its {3}");
  assert.match(emailDe().emailVerificationBodyHtml, />E-Mail-Adresse bestätigen</);
  assert.match(emailDe().passwordResetBodyHtml, />Passwort zurücksetzen</);
  assert.match(emailDe().executeActionsBodyHtml, />Konto aktualisieren</);
});

test("US-QS-32 · F-0376: the e-mail theme ships no external request and names its required actions as the pages do", () => {
  for (const file of themeFiles(EMAIL_THEME)) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /https?:\/\//, `${relative(EMAIL_THEME, file)} links outside`);
  }
  assert.equal(emailDe()["requiredAction.VERIFY_EMAIL"], "E-Mail-Adresse bestätigen");
  assert.equal(emailDe()["requiredAction.UPDATE_PASSWORD"], "Passwort festlegen");
});
