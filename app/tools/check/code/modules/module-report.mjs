// Per-module reports (FR-QG-19, QG-T1, QG-T4). Report only: nothing here fails a build; thresholds stay in
// coverage-thresholds.json (FR-QG-18). Modules come from modules.config.mjs.

/** Module a path like `packages/core/src/light/zones.ts` belongs to, or null (root file, unmoduled folder). */
export function moduleOfPath(file, modules) {
  const m = file.replaceAll("\\", "/").match(/(?:^|\/)packages\/[a-z]+\/src\/([^/]+)\/[^/]+/);
  return m && modules.some((x) => x.name === m[1]) ? m[1] : null;
}

/**
 * Line coverage per module over all packages.
 * @param {Record<string, Record<string, {lines: {total: number, covered: number}}>>} summaries per package, file -> counts
 */
export function coverageByModule(summaries, modules) {
  const sums = new Map();
  for (const files of Object.values(summaries))
    for (const [file, c] of Object.entries(files)) {
      if (file === "total" || !c?.lines) continue;
      const name = moduleOfPath(file, modules);
      if (!name) continue;
      const s = sums.get(name) ?? { total: 0, covered: 0 };
      s.total += c.lines.total;
      s.covered += c.lines.covered;
      sums.set(name, s);
    }
  return [...sums]
    .map(([name, s]) => ({
      name,
      lines: s.total ? Math.round((s.covered / s.total) * 1000) / 10 : null,
      total: s.total,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Stories and test hints per module (QG-T4). A story belongs to the module(s) that list its epic in the register.
 * A test in module X naming a story of an epic outside X is a hint.
 * @param {{id: string, epic: string}[]} stories
 * @param {Record<string, Set<string>>} idsByTestFile test file -> story ids named in its test titles
 */
export function storiesByModule(stories, idsByTestFile, modules) {
  const modulesOfEpic = new Map();
  for (const m of modules)
    for (const e of m.epics) modulesOfEpic.set(e, [...(modulesOfEpic.get(e) ?? []), m.name]);
  const epicOf = new Map(stories.map((s) => [s.id, s.epic]));
  const counts = new Map();
  for (const s of stories) {
    const name = modulesOfEpic.get(s.epic)?.join("+") ?? "(no module)";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const hints = [];
  for (const [file, ids] of Object.entries(idsByTestFile)) {
    const where = moduleOfPath(file, modules);
    if (!where) continue;
    for (const id of [...ids].sort()) {
      const owners = modulesOfEpic.get(epicOf.get(id));
      if (owners && !owners.includes(where))
        hints.push(`test in ${where} names ${id}, a story of ${owners.join("+")} (${file})`);
    }
  }
  return { counts: [...counts].sort(([a], [b]) => a.localeCompare(b)), hints };
}
