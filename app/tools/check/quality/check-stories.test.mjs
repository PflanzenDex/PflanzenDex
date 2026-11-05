import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, after } from "node:test";
import { check } from "./check-stories.mjs";

// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs = [];
after(() => {
  for (const dir of madeDirs) fs.rmSync(dir, { recursive: true, force: true });
});
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  madeDirs.push(dir);
  return dir;
}

function web(files) {
  const dir = tempDir("stories-");
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, "src", rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

const cvaSource = `const v = cva("x", { variants: { variant: { default: "a", ghost: "b" }, size: { sm: "c", lg: "d" } } });
export const Foo = () => null;\n`;
const fullStory = `export default {};
export const Default = {};
export const AllVariants = { render: () => ["default", "ghost", "sm", "lg"] };\n`;

describe("QG-U5 · every ui component has a story", () => {
  it("passes a component with a story that has Default", () => {
    const dir = web({
      "shared/ui/foo.tsx": "export const Foo = () => null;\n",
      "shared/ui/foo.stories.tsx": "export default {};\nexport const Default = {};\n",
      "shared/ui/foo.test.tsx": "",
    });
    assert.deepEqual(check(dir), []);
  });

  it("fails naming a ui component without a story", () => {
    const dir = web({ "shared/ui/foo.tsx": "export {};\n" });
    assert.match(check(dir).join("\n"), /ui\/foo\.tsx.*no foo\.stories\.tsx/);
  });

  it("applies to shared/patterns as well", () => {
    const dir = web({ "shared/patterns/bar.tsx": "export {};\n" });
    assert.match(check(dir).join("\n"), /shared\/patterns\/bar\.tsx/);
  });

  it("fails when the story lacks Default", () => {
    const dir = web({
      "shared/ui/foo.tsx": "export {};\n",
      "shared/ui/foo.stories.tsx": "export const Other = {};\n",
    });
    assert.match(check(dir).join("\n"), /ui\/foo\.stories\.tsx.*Default/);
  });

  it("ignores tests, stories and nested folders as components", () => {
    const dir = web({
      "shared/ui/x.test.tsx": "",
      "shared/ui/x.stories.tsx": "export const Default = {};\n",
    });
    assert.deepEqual(check(dir), []);
  });

  it("passes when there are no component folders", () => {
    assert.deepEqual(check(tempDir("stories-")), []);
  });
});

describe("QG-U5 · every cva variant appears in the story", () => {
  it("passes when AllVariants lists every option", () => {
    const dir = web({ "shared/ui/foo.tsx": cvaSource, "shared/ui/foo.stories.tsx": fullStory });
    assert.deepEqual(check(dir), []);
  });

  it("fails naming a variant option the story never mentions", () => {
    const dir = web({
      "shared/ui/foo.tsx": cvaSource,
      "shared/ui/foo.stories.tsx": fullStory.replace('"ghost", ', ""),
    });
    const out = check(dir).join("\n");
    assert.match(out, /variant "ghost"/);
    assert.doesNotMatch(out, /"lg"/);
  });

  it("fails when cva variants exist but AllVariants is missing", () => {
    const dir = web({
      "shared/ui/foo.tsx": cvaSource,
      "shared/ui/foo.stories.tsx": fullStory.replace("AllVariants", "Catalog"),
    });
    assert.match(check(dir).join("\n"), /AllVariants/);
  });

  it("requires no AllVariants without cva variants", () => {
    const dir = web({
      "shared/ui/foo.tsx": "export {};\n",
      "shared/ui/foo.stories.tsx": "export const Default = {};\n",
    });
    assert.deepEqual(check(dir), []);
  });
});

describe("QG-U5 · every supported state has a story", () => {
  const story = (...names) => names.map((n) => `export const ${n} = {};\n`).join("");

  it("requires Disabled, Invalid and Loading when the source supports them", () => {
    const dir = web({
      "shared/ui/foo.tsx": "const a = <i disabled aria-invalid pending />;\n",
      "shared/ui/foo.stories.tsx": story("Default"),
    });
    const out = check(dir).join("\n");
    for (const name of ["Disabled", "Invalid", "Loading"])
      assert.ok(out.includes(`export ${name}`), out);
  });

  it("passes with the state stories (Pending counts as Loading)", () => {
    const dir = web({
      "shared/ui/foo.tsx": "const a = <i disabled aria-invalid loading />;\n",
      "shared/ui/foo.stories.tsx": story("Default", "Disabled", "Invalid", "Pending"),
    });
    assert.deepEqual(check(dir), []);
  });

  it("ignores Tailwind state modifiers, comments and unrelated words", () => {
    const dir = web({
      "shared/ui/foo.tsx":
        '// shows loading text\n/* disabled */\nconst c = "disabled:opacity-50 aria-invalid:border-red";\nconst d = "undisabled";\n',
      "shared/ui/foo.stories.tsx": story("Default"),
    });
    assert.deepEqual(check(dir), []);
  });
});
