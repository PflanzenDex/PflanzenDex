import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import plugin, { isUserFacingProp } from "./eslint-ui-text.mjs";
import { checkUiText, toBaseline } from "./check-ui-text.mjs";

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});
const rule = plugin.rules["no-literal-text"];
const literal = { messageId: "literal" };

describe("FR-QG-26 rule ui-text/no-literal-text", () => {
  it("FR-QG-26 reports JSX text, user-facing props and toast or announcer messages", () => {
    tester.run("no-literal-text", rule, {
      valid: [
        { code: "const a = <p>{t('deck.empty')}</p>;" },
        { code: "const a = <p> · {n} – 3 % </p>;" },
        { code: 'const a = <div className="flex gap-2" role="list" aria-label={t("x")} />;' },
        { code: 'const a = <Button variant="primary" type="button" />;' },
        { code: 'toast.show({ kind: "error", message: t("saved") });' },
        { code: 'const s = "Standort fehlt";' },
      ],
      invalid: [
        { code: "const a = <p>Standort fehlt</p>;", errors: [literal] },
        { code: 'const a = <p>{"Gegossen"}</p>;', errors: [literal] },
        { code: "const a = <p>{`${n} Pflanzen`}</p>;", errors: [literal] },
        { code: 'const a = <button aria-label="Schließen" />;', errors: [literal] },
        {
          code: 'const a = <input placeholder="Suchen" title="Suche" />;',
          errors: [literal, literal],
        },
        { code: 'const a = <Field label={ok ? "Ja" : "Nein"} />;', errors: [literal, literal] },
        {
          code: 'const a = <Page loadingText="Lädt" closeLabel="Zu" />;',
          errors: [literal, literal],
        },
        {
          code: 'toast.show({ message: "Gelöscht.", action: { label: "Rückgängig" } });',
          errors: [literal, literal],
        },
        { code: 'announcer.announce("Gespeichert");', errors: [literal] },
      ],
    });
  });

  it("FR-QG-26 a baselined file passes up to its count and reports every literal above it", () => {
    tester.run("no-literal-text", rule, {
      valid: [{ code: "const a = <p>Eins</p>;", options: [{ max: 1 }] }],
      invalid: [
        {
          code: "const a = <><p>Eins</p><p>Zwei</p></>;",
          options: [{ max: 1 }],
          errors: [{ messageId: "overBaseline" }, { messageId: "overBaseline" }],
        },
      ],
    });
  });

  it("FR-QG-26 props named …Label or …Text count, technical props do not", () => {
    assert.ok(isUserFacingProp("emptyLabel") && isUserFacingProp("loadingText"));
    assert.ok(
      !isUserFacingProp("className") && !isUserFacingProp("variant") && !isUserFacingProp("Label"),
    );
  });
});

const baseline = (entries) => ({ maxTotal: entries.reduce((s, e) => s + e.count, 0), entries });

describe("FR-QG-26 checkUiText ratchet (QG-C8)", () => {
  it("FR-QG-26 passes when the counts match the baseline exactly", () => {
    const b = baseline([{ file: "a.tsx", count: 2 }]);
    assert.deepEqual(checkUiText(new Map([["a.tsx", 2]]), b), []);
  });
  it("FR-QG-26 UT-1: a new literal, in a listed or an unlisted file", () => {
    const b = baseline([{ file: "a.tsx", count: 2 }]);
    assert.match(checkUiText(new Map([["a.tsx", 3]]), b)[0], /^UT-1 a\.tsx: 3 .* allows 2/);
    const e = checkUiText(
      new Map([
        ["a.tsx", 2],
        ["b.tsx", 1],
      ]),
      b,
    );
    assert.match(e[0], /^UT-1 b\.tsx: 1 .* allows 0/);
  });
  it("FR-QG-26 UT-2: a moved text lowers or removes the entry", () => {
    const b = baseline([{ file: "a.tsx", count: 2 }]);
    assert.match(checkUiText(new Map([["a.tsx", 1]]), b)[0], /^UT-2 a\.tsx: 1 .* lower the entry/);
    assert.match(checkUiText(new Map(), b)[0], /^UT-2 a\.tsx: .*remove the entry/);
  });
  it("FR-QG-26 UT-3: the baseline never grows beyond maxTotal", () => {
    const b = { maxTotal: 1, entries: [{ file: "a.tsx", count: 2 }] };
    assert.match(checkUiText(new Map([["a.tsx", 2]]), b)[0], /^UT-3 .* 2 .* maxTotal is 1/);
  });
  it("FR-QG-26 toBaseline sorts the files and sums maxTotal", () => {
    assert.deepEqual(
      toBaseline(
        new Map([
          ["b.tsx", 1],
          ["a.tsx", 2],
        ]),
      ),
      {
        maxTotal: 3,
        entries: [
          { file: "a.tsx", count: 2 },
          { file: "b.tsx", count: 1 },
        ],
      },
    );
  });
});
