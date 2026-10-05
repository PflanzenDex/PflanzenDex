// Kernel glossary (AB-11) and port contract tests (AB-13), part of the module boundary check (FR-QG-19, ADR 0003).
import fs from "node:fs";
import path from "node:path";

const LAYERS = ["core", "db", "api", "web"];
const CONFIG_FILE = "modules.config.mjs";
const isTestFile = (f) => /\.test\.[a-z]+$/.test(f);
const isTestHelper = (f) => path.parse(f).name === "test-helpers";

// Code without comments and string/template literals (error texts and keys are data, identifiers are code).
const codeOnly = (h, src) =>
  h
    .stripComments(src)
    .replace(/\/\/.*$/gm, "")
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
const singular = (w) =>
  w.endsWith("es") ? [w, w.slice(0, -2), w.slice(0, -1)] : [w, w.replace(/s$/, "")];

// AB-11: the kernel means nothing in the domain, so no identifier of its code carries a glossary word.
export function checkKernelGlossary({ appDir, add, cfg, h }) {
  const words = new Set(cfg.KERNEL_GLOSSARY_WORDS ?? []);
  if (!words.size) return;
  for (const pkg of LAYERS)
    for (const file of h.walkCode(path.join(appDir, "packages", pkg, "src", cfg.KERNEL))) {
      if (isTestFile(file) || isTestHelper(path.basename(file))) continue;
      codeOnly(h, fs.readFileSync(file, "utf8"))
        .split("\n")
        .forEach((text, i) => {
          for (const id of text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])
            for (const part of id
              .replace(/([a-z])([A-Z])/g, "$1_$2")
              .toLowerCase()
              .split("_"))
              if (singular(part).some((w) => words.has(w)))
                add(
                  "AB-11",
                  file,
                  i + 1,
                  `${cfg.KERNEL} names the glossary word "${part}" in \`${id}\` (no domain knowledge in the kernel)`,
                );
        });
    }
}

// AB-13: a port is a contract. Every port that is declared in code has a shared contract test that implementations pass.
const declaredNames = (src) =>
  new Set([...src.matchAll(/\b(?:interface|type|class)\s+(\w+)/g)].map((m) => m[1]));
const namedWords = (src) => new Set(src.match(/\w+/g) ?? []);

export function checkPortContracts({ appDir, add, cfg, h }) {
  const exempt = cfg.PORTS_WITHOUT_CONTRACT_TEST ?? {};
  const file = path.join(appDir, CONFIG_FILE);
  // The implementer, not the owner, usually holds the contract test (e.g. `care` for a port of `collection`).
  const contracts = new Set();
  for (const f of LAYERS.flatMap((pkg) => h.walkCode(path.join(appDir, "packages", pkg, "src"))))
    if (/\.contract\.test\.[a-z]+$/.test(f))
      namedWords(fs.readFileSync(f, "utf8")).forEach((w) => contracts.add(w));
  for (const m of cfg.MODULES) {
    const declared = new Set();
    for (const pkg of LAYERS)
      for (const f of h.walkCode(path.join(appDir, "packages", pkg, "src", m.name)))
        if (!isTestFile(f))
          declaredNames(h.stripComments(fs.readFileSync(f, "utf8"))).forEach((w) =>
            declared.add(w),
          );
    for (const port of m.ports) {
      const stale = port in exempt && (!declared.has(port) || contracts.has(port));
      if (stale)
        add("AB-13", file, 0, `PORTS_WITHOUT_CONTRACT_TEST entry ${port} is stale: remove it`);
      else if (declared.has(port) && !contracts.has(port) && !(port in exempt))
        add(
          "AB-13",
          file,
          0,
          `port ${port} (${m.name}) has no contract test (*.contract.test.ts naming it)`,
        );
    }
  }
}
