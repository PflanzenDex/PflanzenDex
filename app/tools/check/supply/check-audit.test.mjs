import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAudit, collectAdvisories } from "./check-audit.mjs";

const adv = (id, severity = "high", name = "pkg") => ({
  name,
  severity,
  source: 1,
  url: `https://github.com/advisories/${id}`,
});
const audit = (...via) => ({ vulnerabilities: { pkg: { via }, parent: { via: ["pkg"] } } });
const entry = (advisory, expires = "2027-01-01") => ({
  advisory,
  package: "pkg",
  reason: "r",
  expires,
});
const today = "2026-10-03";

test("QG-S2: an allowlisted high advisory is tolerated and listed", () => {
  const r = checkAudit({
    audit: audit(adv("GHSA-aaaa")),
    allowlist: { entries: [entry("GHSA-aaaa")] },
    today,
  });
  assert.equal(r.ok, true);
  assert.match(r.tolerated.join(), /GHSA-aaaa/);
});

test("QG-S2: an unlisted high advisory fails the gate", () => {
  const r = checkAudit({ audit: audit(adv("GHSA-fake")), allowlist: { entries: [] }, today });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /GHSA-fake.*not in audit-allowlist/);
});

test("QG-S2: an unlisted critical advisory fails the gate", () => {
  const r = checkAudit({
    audit: audit(adv("GHSA-crit", "critical")),
    allowlist: { entries: [] },
    today,
  });
  assert.equal(r.ok, false);
});

test("QG-S2: moderate and low advisories are ignored", () => {
  const r = checkAudit({
    audit: audit(adv("GHSA-mod", "moderate"), adv("GHSA-low", "low")),
    allowlist: { entries: [] },
    today,
  });
  assert.equal(r.ok, true);
});

test("QG-S2: an expired allowlist entry fails with a re-review message", () => {
  const r = checkAudit({
    audit: audit(adv("GHSA-aaaa")),
    allowlist: { entries: [entry("GHSA-aaaa", "2026-10-02")] },
    today,
  });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /expired on 2026-10-02/);
});

test("QG-S2: an entry expiring today is still valid", () => {
  const r = checkAudit({
    audit: audit(adv("GHSA-aaaa")),
    allowlist: { entries: [entry("GHSA-aaaa", today)] },
    today,
  });
  assert.equal(r.ok, true);
});

test("QG-S2: an allowlisted advisory that vanished only gives a removal hint", () => {
  const r = checkAudit({
    audit: { vulnerabilities: {} },
    allowlist: { entries: [entry("GHSA-gone")] },
    today,
  });
  assert.equal(r.ok, true);
  assert.match(r.hints.join(), /GHSA-gone.*remove/);
});

test("QG-S2: the same advisory reached through several packages is counted once", () => {
  const a = { vulnerabilities: { a: { via: [adv("GHSA-x")] }, b: { via: [adv("GHSA-x")] } } };
  assert.equal(collectAdvisories(a).length, 1);
});
