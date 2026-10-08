// Pure rules of the QG-U5 conformance run (FR-QG-09, US-QS-07, docs/guides/reference/design-system.md DS-15/17/19/20/37/38/40).
// The browser part lives in check-conformance.mjs; everything that decides pass or fail is here and unit tested.

export const MIN_TARGET = 44; // DS-15, CSS px
const ROUNDING = 0.5; // sub-pixel layout, e.g. 43.6 px renders as a 44 px box
const BLOCKING_IMPACT = new Set(["serious", "critical"]); // FR-QG-09; moderate joins once the baseline is clean

const where = ({ story, scheme }) => `QG-U5 ${story} (${scheme})`;

/** DS-15: every interactive element measures at least 44x44 CSS px. */
export function targetFindings(ctx, targets) {
  return targets
    .filter((t) => t.width < MIN_TARGET - ROUNDING || t.height < MIN_TARGET - ROUNDING)
    .map(
      (t) =>
        `${where(ctx)}: ${t.selector} is ${Math.round(t.width)}x${Math.round(t.height)} px, needs ${MIN_TARGET}x${MIN_TARGET} (DS-15)`,
    );
}

/** axe violations of impact serious or critical fail, unless an allow-list entry names story and rule. */
export function axeFindings(ctx, violations, allowlist) {
  return violations
    .filter((v) => BLOCKING_IMPACT.has(v.impact))
    .filter((v) => !allowlist.some((a) => a.story === ctx.story && a.rule === v.id))
    .map((v) => {
      const nodes = v.nodes
        .map((n) => [n.target.join(" "), n.any?.[0]?.message].filter(Boolean).join(" - "))
        .join(" | ");
      return `${where(ctx)}: axe ${v.id} (${v.impact}): ${v.help}: ${nodes}`;
    });
}

/** The allow-list is a visible file; every entry needs a written reason (FR-QG-09). It starts empty. */
export function parseAllowlist(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data.entries))
    throw new Error("conformance allow-list: `entries` must be an array");
  for (const e of data.entries) {
    if (!e.story || !e.rule || typeof e.reason !== "string" || e.reason.trim() === "")
      throw new Error(
        `conformance allow-list: entry ${JSON.stringify(e)} needs story, rule and a written reason`,
      );
  }
  return data.entries;
}

const differs = (a, b) => a.outline !== b.outline || a.boxShadow !== b.boxShadow;

/** DS-37: focusing an element with Tab changes its outline or box-shadow. */
export function focusFindings(ctx, focused) {
  return focused
    .filter((f) => !differs(f.before, f.after))
    .map((f) => `${where(ctx)}: ${f.selector} shows no focus indicator on Tab (DS-37)`);
}

/** DS-40: overlays close on Esc; when opened from a trigger, focus returns to it. */
export function overlayFindings(ctx, overlays) {
  const out = [];
  for (const o of overlays) {
    const name = o.trigger ?? "open overlay";
    if (!o.closedOnEsc) out.push(`${where(ctx)}: ${name} does not close on Esc (DS-40)`);
    else if (o.trigger && !o.focusReturned)
      out.push(`${where(ctx)}: ${name} does not return focus to its trigger after Esc (DS-40)`);
  }
  return out;
}
