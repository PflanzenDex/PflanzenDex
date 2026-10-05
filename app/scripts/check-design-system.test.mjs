import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { compare, scan, toEntries } from "./check-design-system.mjs";

function web(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ds-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}
const stack = JSON.stringify({
  dependencies: Object.fromEntries(
    [
      "tailwindcss",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
      "react-hook-form",
      "zod",
    ].map((n) => [n, "1"]),
  ),
});

describe("design system gate (DESIGN-SYSTEM.md section 6)", () => {
  it("passes a compliant package", () => {
    const dir = web({
      "package.json": stack,
      "src/lib/utils.ts": "export {};\n",
      "src/components/ui/button.tsx": 'export const B = () => <button className="h-dvh" />;\n',
      "src/care/a.tsx": 'import { x } from "@/light";\n',
    });
    assert.equal(scan(dir).size, 0);
  });

  it("flags desktop-first queries, vh, colors, inline style, outline and raw controls", () => {
    const dir = web({
      "package.json": stack,
      "src/lib/utils.ts": "",
      "src/components/ui/x.ts": "",
      "src/a.css":
        "@media (max-width: 600px) { a { color: #fff; outline: none; height: 100vh } }\n",
      "src/b.tsx":
        'export const B = () => <input style={{ width: 3 }} className="bg-green-600 max-md:flex" />;\n',
    });
    const keys = [...scan(dir).keys()].sort();
    assert.deepEqual(keys, [
      "DS-12|a.css",
      "DS-12|b.tsx",
      "DS-21|a.css",
      "DS-27|a.css",
      "DS-27|b.tsx",
      "DS-32|b.tsx",
      "DS-37|a.css",
      "DS-48|b.tsx",
    ]);
  });

  it("allows CSS-variable inline style and tokens in the token file", () => {
    const dir = web({
      "package.json": stack,
      "src/lib/utils.ts": "",
      "src/components/ui/x.ts": "",
      "src/style.css": ":root { --a: #fff; }\n",
      "src/b.tsx": 'export const B = () => <i style={{ "--value": 3 }} />;\n',
    });
    assert.equal(scan(dir).size, 0);
  });

  it("checks layer imports", () => {
    const dir = web({
      "package.json": stack,
      "src/lib/utils.ts": "",
      "src/components/ui/x.tsx": 'import { a } from "@/care";\n',
      "src/components/shared/y.tsx": 'import { a } from "@/care";\n',
      "src/care/z.tsx": 'import { a } from "@/light/deep/file";\n',
    });
    const keys = [...scan(dir).keys()].sort();
    assert.deepEqual(keys, [
      "DS-01|components/ui/x.tsx",
      "DS-02|components/shared/y.tsx",
      "DS-42|care/z.tsx",
    ]);
  });

  it("flags SPA-irrelevant directives and device APIs outside platform/ (DS-07, DS-10)", () => {
    const dir = web({
      "package.json": stack,
      "src/lib/utils.ts": "",
      "src/components/ui/x.ts": "",
      "src/a.tsx": '"use client";\nexport const a = () => localStorage.getItem("k");\n',
      "src/platform/storage.tsx": 'export const s = () => localStorage.getItem("k");\n',
    });
    assert.deepEqual([...scan(dir).keys()].sort(), ["DS-07|a.tsx", "DS-10|a.tsx"]);
  });

  it("reports the missing design system stack (DS-57)", () => {
    const keys = [...scan(web({ "package.json": "{}" })).keys()];
    assert.ok(keys.includes("DS-57|dependency:tailwindcss"));
    assert.ok(keys.includes("DS-57|missing:src/components/ui"));
  });

  it("ratchets: new and grown violations fail, fixed ones must leave the baseline", () => {
    const counts = new Map([
      ["DS-12|a.css", 2],
      ["DS-21|b.css", 1],
    ]);
    const entries = [
      { rule: "DS-12", file: "a.css", count: 1 },
      { rule: "DS-27", file: "c.css", count: 1 },
    ];
    const problems = compare(counts, entries);
    assert.equal(problems.length, 3);
    assert.match(problems[0], /DSB-1 DS-12 a.css/);
    assert.match(problems[1], /DSB-1 DS-21 b.css/);
    assert.match(problems[2], /DSB-2 DS-27 c.css/);
    assert.deepEqual(compare(counts, toEntries(counts)), []);
  });
});
