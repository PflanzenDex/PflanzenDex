import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { compare, NON_BASELINEABLE_RULES, scan, toEntries } from "./check-design-system.mjs";

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
      "DS-33|a.css",
      "DS-37|a.css",
      "DS-48|b.tsx",
    ]);
  });

  it("allows CSS-variable inline style and tokens in the token file", () => {
    const dir = web({
      "package.json": stack,
      "src/lib/utils.ts": "",
      "src/components/ui/x.ts": "",
      "src/styles/tokens.css": ":root { --a: #fff; }\n",
      "src/b.tsx": 'export const B = () => <i style={{ "--value": 3 }} />;\n',
    });
    assert.equal(scan(dir).size, 0);
  });

  it("QG-U4 · no css outside styles: a new module stylesheet fails, tokens.css passes", () => {
    const base = { "package.json": stack, "src/lib/utils.ts": "", "src/components/ui/x.ts": "" };
    const bad = web({ ...base, "src/wishlist/wishlist.css": ".a { margin: 0; }\n" });
    assert.deepEqual([...scan(bad).keys()], ["DS-33|wishlist/wishlist.css"]);
    const empty = web({ ...base, "src/wishlist/empty.css": "" });
    assert.deepEqual([...scan(empty).keys()], ["DS-33|wishlist/empty.css"]);
    const legacy = web({ ...base, "src/style.css": ":root { --a: #fff; }\n" });
    assert.ok(scan(legacy).has("DS-33|style.css"));
    assert.ok(scan(legacy).has("DS-27|style.css"));
    const ok = web({ ...base, "src/styles/tokens.css": "@layer base { a { @apply p-2; } }\n" });
    assert.equal(scan(ok).size, 0);
  });

  it("QG-U4 · no css outside styles: @apply and style tags in components fail", () => {
    const dir = web({
      "package.json": stack,
      "src/lib/utils.ts": "",
      "src/components/ui/x.ts": "",
      "src/a.tsx": 'export const A = () => <style>{".a { @apply p-2; }"}</style>;\n',
    });
    assert.deepEqual([...scan(dir).keys()], ["DS-33|a.tsx"]);
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
      { rule: "DS-32", file: "c.css", count: 1 },
    ];
    const problems = compare(counts, entries);
    assert.equal(problems.length, 3);
    assert.match(problems[0], /DSB-1 DS-12 a.css/);
    assert.match(problems[1], /DSB-1 DS-21 b.css/);
    assert.match(problems[2], /DSB-2 DS-32 c.css/);
    assert.deepEqual(compare(counts, toEntries(counts)), []);
  });

  const good = `import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
const v = cva("base", {
  variants: { variant: { a: "x", b: "y" } },
  defaultVariants: { variant: "a" },
});
export function C({ className, variant }: { className?: string; variant?: "a" | "b" }) {
  return <i className={cn(v({ variant }), className)} />;
}
`;
  const ui = (content, name = "c") => ({
    "package.json": stack,
    "src/lib/utils.ts": "",
    [`src/components/ui/${name}.tsx`]: content,
  });
  const run = (files) => {
    const locations = new Map();
    const counts = scan(web(files), locations);
    return { keys: [...counts.keys()].sort(), locations, counts };
  };

  it("QG-U4 · DS-34 passes a cva + cn component with defaultVariants", () => {
    const { keys } = run(ui(good));
    assert.deepEqual(keys, []);
  });

  it("QG-U4 · DS-34 fails a ternary in className and names the rule and the line", () => {
    const src =
      'export const C = ({ isOn }: { isOn: boolean }) => (\n  <i className={isOn ? "a" : "b"} />\n);\n';
    const { keys, locations, counts } = run(ui(src));
    assert.deepEqual(keys, ["DS-34|components/ui/c.tsx"]);
    assert.deepEqual(locations.get("DS-34|components/ui/c.tsx"), [2]);
    const [problem] = compare(counts, [], locations);
    assert.match(problem, /DSB-1 DS-34 components\/ui\/c\.tsx.*line 2/);
  });

  it("QG-U4 · DS-34 fails && inside cn() in className, but allows it with cva", () => {
    const bad =
      'export const C = ({ on }: { on: boolean }) => (\n  <i className={cn("a",\n on && "b")} />\n);\n';
    assert.deepEqual(run(ui(bad)).keys, ["DS-34|components/ui/c.tsx"]);
    assert.deepEqual(
      run(ui(`${good}const x = (on: boolean) => <i className={cn(on && "b")} />;\n`)).keys,
      [],
    );
  });

  it("QG-U4 · DS-34 ignores ?. and ?? and ternaries outside className", () => {
    const src =
      'export const C = (p: { a?: { b: string } }) => <i className={cn("a", p.a?.b ?? "c")} />;\nconst n = p ? 1 : 2;\n';
    assert.deepEqual(run(ui(src)).keys, []);
  });

  it("QG-U4 · DS-34 fails variant/size props without cva", () => {
    const src = 'type P = {\n  variant?: "a" | "b";\n};\nexport const C = (_: P) => <i />;\n';
    const { keys, locations } = run(ui(src));
    assert.deepEqual(keys, ["DS-34|components/ui/c.tsx"]);
    assert.deepEqual(locations.get(keys[0]), [2]);
  });

  it("QG-U4 · DS-34 does not apply outside components/ui or to stories", () => {
    const src = 'export const C = ({ o }: { o: boolean }) => <i className={o ? "a" : "b"} />;\n';
    const files = {
      ...ui("", "ok"),
      "src/components/shared/s.tsx": src,
      "src/components/ui/c.stories.tsx": src,
    };
    assert.deepEqual(run(files).keys, []);
  });

  it("QG-U4 · DS-31 fails template literals and concatenation in className under components/", () => {
    const files = {
      ...ui("", "ok"),
      "src/components/ui/t.tsx":
        "export const T = ({ a }: { a: string }) => <i className={`x ${a}`} />;\n",
      "src/components/shared/c.tsx":
        'export const C = ({ a }: { a: string }) => <i className={"x " + a} />;\n',
      "src/components/shared/ok.tsx": 'export const O = () => <i className={cn("x")} />;\n',
      "src/care/other.tsx":
        "export const D = ({ a }: { a: string }) => <i className={`x ${a}`} />;\n",
    };
    assert.deepEqual(run(files).keys, [
      "DS-31|components/shared/c.tsx",
      "DS-31|components/ui/t.tsx",
    ]);
  });

  it("QG-U4 · DS-35 fails a cva call without defaultVariants and names the line", () => {
    const src =
      'import { cva } from "class-variance-authority";\n\nconst v = cva("base", {\n  variants: { a: { b: "c" } },\n});\nexport const C = () => <i className={v()} />;\n';
    const { keys, locations } = run(ui(src));
    assert.deepEqual(keys, ["DS-35|components/ui/c.tsx"]);
    assert.deepEqual(locations.get(keys[0]), [3]);
  });

  it("QG-U4 · DS-35 accepts cva with defaultVariants", () => {
    assert.deepEqual(run(ui(good)).keys, []);
  });

  it("QG-U4 · DS-36 fails a ui component that accepts className but never calls cn()", () => {
    const src =
      "export const C = ({ className }: { className?: string }) => <i className={className} />;\n";
    assert.deepEqual(run(ui(src)).keys, ["DS-36|components/ui/c.tsx"]);
    assert.deepEqual(run(ui('export const C = () => <i className="x" />;\n')).keys, []);
  });

  it("QG-U4 · DS-48 cannot be baselined", () => {
    const files = {
      ...ui("", "ok"),
      "src/wishlist/foo.tsx": "export const F = () => <button />;\n",
    };
    const { counts, locations } = run(files);
    const entry = { rule: "DS-48", file: "wishlist/foo.tsx", count: 1 };
    const problems = compare(counts, [entry], locations);
    assert.ok(problems.some((p) => /^DSB-1 DS-48 wishlist\/foo\.tsx/.test(p)));
    assert.ok(problems.some((p) => /^DSB-3 DS-48 wishlist\/foo\.tsx/.test(p)));
    assert.ok(compare(counts, [], locations).some((p) => /^DSB-1 DS-48/.test(p)));
  });

  it("QG-U4 · closed rules reject every baseline entry, even a stale one", () => {
    assert.deepEqual([...NON_BASELINEABLE_RULES].sort(), [
      "DS-01",
      "DS-02",
      "DS-07",
      "DS-27",
      "DS-37",
      "DS-42",
      "DS-48",
    ]);
    for (const rule of NON_BASELINEABLE_RULES) {
      const problems = compare(new Map(), [{ rule, file: "x.tsx", count: 1 }]);
      assert.ok(
        problems.some((p) => p.startsWith(`DSB-3 ${rule} x.tsx`)),
        rule,
      );
    }
    assert.deepEqual(
      compare(new Map([["DS-12|a.css", 1]]), [{ rule: "DS-12", file: "a.css", count: 1 }]),
      [],
    );
  });

  it("QG-U4 · raw controls in components/ui pass", () => {
    const src =
      "export const C = () => (\n  <div>\n    <button />\n    <input />\n    <select />\n    <textarea />\n  </div>\n);\n";
    assert.deepEqual(run(ui(src)).keys, []);
  });

  it("QG-U4 · the committed baseline has no entry for a closed rule", () => {
    const file = path.join(import.meta.dirname, "../../../../quality-ds-baseline.json");
    const { entries } = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.deepEqual(
      entries.filter((e) => NON_BASELINEABLE_RULES.has(e.rule)),
      [],
    );
  });
});
