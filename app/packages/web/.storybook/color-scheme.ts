// Emulates `prefers-color-scheme` inside the catalog (ADR 0007 decision 6: dark follows the system).
// CSS media queries cannot be switched from JavaScript, so the toolbar value is applied by rewriting
// the media condition of every `@media (prefers-color-scheme: …)` rule that is loaded (tokens, Tailwind `dark:`).

export type ColorScheme = "light" | "dark";

const SCHEME_QUERY = /prefers-color-scheme/;

function* mediaRules(rules: CSSRuleList): Generator<CSSMediaRule> {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) yield rule;
    if ("cssRules" in rule) yield* mediaRules((rule as CSSGroupingRule).cssRules);
  }
}

function sheetRules(sheet: CSSStyleSheet): CSSRuleList | null {
  try {
    return sheet.cssRules;
  } catch {
    return null; // cross-origin sheet: cannot be read, so it keeps its own behavior
  }
}

/** Remembers each rule's original condition so switching back and forth stays exact. */
const originals = new WeakMap<CSSMediaRule, string>();

function matches(condition: string, scheme: ColorScheme): boolean {
  return condition.includes(`prefers-color-scheme: ${scheme}`);
}

export function applyColorScheme(scheme: ColorScheme, doc: Document = document): void {
  doc.documentElement.dataset.colorScheme = scheme;
  doc.documentElement.style.colorScheme = scheme;
  for (const sheet of Array.from(doc.styleSheets)) {
    const rules = sheetRules(sheet);
    if (!rules) continue;
    for (const rule of mediaRules(rules)) {
      const original = originals.get(rule) ?? rule.media.mediaText;
      if (!SCHEME_QUERY.test(original)) continue;
      originals.set(rule, original);
      rule.media.mediaText = matches(original, scheme) ? "all" : "not all";
    }
  }
}
